import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

import { z } from "zod";

import type { AuditReport } from "../model/diagnostics.js";
import type {
  ThoughtEvent,
  ThoughtReflection,
  ThoughtSnapshot,
  ThoughtStatus,
} from "../thought/store.js";
import { LlmthinkApplicationService } from "./application-service.js";
import {
  LlmthinkServerError,
  type LlmthinkServerErrorCode,
  type RequestContext,
  type ServerThoughtSnapshot,
  type ThoughtRef,
} from "./contracts.js";
import {
  LlmthinkSecurityBoundary,
  type LlmthinkHostedAuthenticator,
} from "./security.js";
import type { LlmthinkOnboardingHttpHandler } from "./onboarding.js";

export const DEFAULT_HTTP_REQUEST_LIMIT_BYTES = 1024 * 1024;
export const DEFAULT_HTTP_RESPONSE_LIMIT_BYTES = 2 * 1024 * 1024;

export type LlmthinkHttpAuthenticator = LlmthinkHostedAuthenticator;

export interface LlmthinkHttpHandlerOptions {
  readonly application: LlmthinkApplicationService;
  readonly authenticate: LlmthinkHttpAuthenticator;
  readonly security?: LlmthinkSecurityBoundary;
  readonly isReady?: () => boolean | Promise<boolean>;
  readonly requestLimitBytes?: number;
  readonly responseLimitBytes?: number;
  readonly onboarding?: LlmthinkOnboardingHttpHandler;
}

interface HttpSuccess {
  readonly data: unknown;
  readonly request_id: string;
  readonly warnings: readonly unknown[];
}

const identitySchema = z.object({
  idempotency_key: z.string().min(1).max(200),
  request_digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
});

const revisionSchema = z.object({
  expected_revision: z.number().int().nonnegative(),
});
const auditSchema = z.object({
  engine_version: z.string(),
  document_id: z.string(),
  generated_at: z.string(),
  summary: z.object({
    fatal_count: z.number().int().nonnegative(),
    error_count: z.number().int().nonnegative(),
    warning_count: z.number().int().nonnegative(),
    info_count: z.number().int().nonnegative(),
    hint_count: z.number().int().nonnegative(),
  }),
  results: z.array(z.unknown()),
  query_results: z.array(z.unknown()),
});

const auditTextSchema = z.object({
  text: z.string().min(1),
  document_id: z.string().optional(),
});
const createThoughtSchema = identitySchema.extend({
  thought_id: z.string(),
  draft_text: z.string(),
});
const saveDraftSchema = identitySchema
  .merge(revisionSchema)
  .extend({ draft_text: z.string() });
const recordAuditSchema = identitySchema
  .merge(revisionSchema)
  .extend({ report: auditSchema });
const finalizeSchema = identitySchema.merge(revisionSchema).extend({
  final_text: z.string(),
  confirmation_token: z.string(),
});
const reflectionSchema = identitySchema.merge(revisionSchema).extend({
  kind: z.enum(["note", "concern", "decision", "follow_up", "audit_response"]),
  text: z.string().min(1),
});
const searchSchema = z.object({
  query: z.string().min(1),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100),
  include_reflections: z.boolean(),
});

const HTTP_STATUS: Readonly<Record<LlmthinkServerErrorCode, number>> = {
  invalid_argument: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  revision_conflict: 409,
  idempotency_conflict: 409,
  confirmation_required: 428,
  payload_too_large: 413,
  rate_limited: 429,
  storage_corrupt: 500,
  unsupported_schema_version: 500,
  internal: 500,
};

function invalidInput(error: z.ZodError): LlmthinkServerError {
  return new LlmthinkServerError(
    "invalid_argument",
    "Request body is invalid",
    {
      fields: error.issues.map((issue) => issue.path.join(".")),
    },
  );
}

function parseBody<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw invalidInput(parsed.error);
  return parsed.data;
}

async function readJsonBody(
  request: IncomingMessage,
  limit: number,
): Promise<unknown> {
  const contentType = request.headers["content-type"] ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new LlmthinkServerError(
      "invalid_argument",
      "Content-Type must be application/json",
    );
  }
  const declared = Number(request.headers["content-length"]);
  if (Number.isFinite(declared) && declared > limit) {
    throw new LlmthinkServerError(
      "payload_too_large",
      "Request body is too large",
    );
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) {
      throw new LlmthinkServerError(
        "payload_too_large",
        "Request body is too large",
      );
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new LlmthinkServerError(
      "invalid_argument",
      "Request body must be valid JSON",
    );
  }
}

function thoughtRef(context: RequestContext, thoughtId: string): ThoughtRef {
  return {
    tenantId: context.tenantId,
    workspaceId: context.workspaceId,
    thoughtId,
  };
}

function projectReflection(value: ThoughtReflection): Record<string, unknown> {
  return { id: value.id, at: value.at, kind: value.kind, text: value.text };
}

function projectEvent(value: ThoughtEvent): Record<string, unknown> {
  return {
    at: value.at,
    kind: value.kind,
    summary: value.summary,
    ...(value.path ? { path: value.path } : {}),
  };
}

function projectSnapshot(
  value: ServerThoughtSnapshot,
): Record<string, unknown> {
  const snapshot: ThoughtSnapshot = value;
  return {
    tenant_id: value.tenantId,
    workspace_id: value.workspaceId,
    thought_id: snapshot.record.id,
    revision: value.revision,
    status: snapshot.record.status,
    created_at: snapshot.record.created_at,
    updated_at: snapshot.record.updated_at,
    draft_text: snapshot.draftText,
    final_text: snapshot.finalText,
    semantic_audit_text: snapshot.semanticAuditText,
    latest_audit: snapshot.latestAudit,
    history: snapshot.history.map(projectEvent),
    reflections: snapshot.reflections.map(projectReflection),
  };
}

function responseRequestId(request: IncomingMessage): string {
  const value = request.headers["x-request-id"];
  return typeof value === "string" && value.length > 0 ? value : "unavailable";
}

function sendJson(
  response: ServerResponse,
  status: number,
  value: unknown,
  limit: number,
): void {
  if (response.destroyed || response.writableEnded) return;
  let body = `${JSON.stringify(value)}\n`;
  if (Buffer.byteLength(body) > limit) {
    status = HTTP_STATUS.payload_too_large;
    body = `${JSON.stringify({
      error: {
        code: "payload_too_large",
        message: "Response body is too large",
        retryable: false,
      },
      request_id:
        (value as { request_id?: string }).request_id ?? "unavailable",
    })}\n`;
  }
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
}

function success(data: unknown, requestId: string): HttpSuccess {
  return { data, request_id: requestId, warnings: [] };
}

function toServerError(error: unknown): LlmthinkServerError {
  return error instanceof LlmthinkServerError
    ? error
    : new LlmthinkServerError("internal", "Internal server error");
}

function errorEnvelope(
  error: LlmthinkServerError,
  requestId: string,
): Record<string, unknown> {
  return {
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(error.details ? { details: projectDetails(error.details) } : {}),
    },
    request_id: requestId,
  };
}

function projectDetails(
  details: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => [
      key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
      value,
    ]),
  );
}

function routeThoughtId(pathname: string, suffix = ""): string | undefined {
  const match = pathname.match(
    new RegExp(`^/api/v1/thoughts/([^/]+)${suffix}$`),
  );
  if (!match?.[1]) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    throw new LlmthinkServerError("invalid_argument", "Invalid route encoding");
  }
}

function routeThoughtIdForMethod(
  actualMethod: string,
  expectedMethod: string,
  pathname: string,
  suffix: string,
): string | undefined {
  return actualMethod === expectedMethod
    ? routeThoughtId(pathname, suffix)
    : undefined;
}

function parseListQuery(url: URL): {
  limit: number;
  cursor?: string;
  status?: ThoughtStatus;
} {
  const limit = Number(url.searchParams.get("limit") ?? "20");
  const status = url.searchParams.get("status");
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    (status && status !== "draft" && status !== "finalized")
  )
    throw new LlmthinkServerError("invalid_argument", "Invalid list query");
  const cursor = url.searchParams.get("cursor");
  return {
    limit,
    ...(cursor ? { cursor } : {}),
    ...(status ? { status: status as ThoughtStatus } : {}),
  };
}

function restOperation(method: string | undefined, pathname: string): string {
  const verb = method ?? "GET";
  if (pathname === "/api/v1/audits") return `${verb} audits`;
  if (pathname === "/api/v1/thoughts") return `${verb} thoughts`;
  if (pathname === "/api/v1/thoughts/search") return `${verb} thought_search`;
  if (pathname.endsWith("/draft")) return `${verb} thought_draft`;
  if (pathname.endsWith("/audits")) return `${verb} thought_audit`;
  if (pathname.endsWith("/finalize")) return `${verb} thought_finalize`;
  if (pathname.endsWith("/reflections")) return `${verb} thought_reflection`;
  if (pathname.endsWith("/events")) return `${verb} thought_events`;
  if (pathname.startsWith("/api/v1/thoughts/")) return `${verb} thought`;
  return `${verb} unknown`;
}

async function dispatchControlRoute(
  options: LlmthinkHttpHandlerOptions,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  requestId: string,
  responseLimit: number,
): Promise<boolean> {
  if (request.method === "GET" && url.pathname === "/healthz") {
    sendJson(
      response,
      200,
      success({ status: "ok" }, requestId),
      responseLimit,
    );
    return true;
  }
  if (request.method === "GET" && url.pathname === "/readyz") {
    const ready = (await options.isReady?.()) ?? true;
    sendJson(
      response,
      ready ? 200 : 503,
      success({ status: ready ? "ready" : "not_ready" }, requestId),
      responseLimit,
    );
    return true;
  }
  return (await options.onboarding?.(request, response)) ?? false;
}

export function createLlmthinkHttpHandler(options: LlmthinkHttpHandlerOptions) {
  const requestLimit =
    options.requestLimitBytes ?? DEFAULT_HTTP_REQUEST_LIMIT_BYTES;
  const responseLimit =
    options.responseLimitBytes ?? DEFAULT_HTTP_RESPONSE_LIMIT_BYTES;
  const security =
    options.security ??
    new LlmthinkSecurityBoundary({ authenticate: options.authenticate });

  return async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    let requestId = responseRequestId(request);
    try {
      const url = new URL(request.url ?? "/", "https://llmthink.invalid");
      if (
        await dispatchControlRoute(
          options,
          request,
          response,
          url,
          requestId,
          responseLimit,
        )
      ) {
        return;
      }

      const context = await security.authenticate(request);
      requestId = context.requestId;
      const result = await security.execute(
        context,
        "rest",
        restOperation(request.method, url.pathname),
        () =>
          dispatchApi(options.application, request, url, context, requestLimit),
      );
      sendJson(
        response,
        result.status,
        success(result.data, requestId),
        responseLimit,
      );
    } catch (caught) {
      const error = toServerError(caught);
      sendJson(
        response,
        HTTP_STATUS[error.code],
        errorEnvelope(error, requestId),
        responseLimit,
      );
    }
  };
}

interface DispatchResult {
  readonly status: number;
  readonly data: unknown;
}

async function dispatchApi(
  application: LlmthinkApplicationService,
  request: IncomingMessage,
  url: URL,
  context: RequestContext,
  requestLimit: number,
): Promise<DispatchResult> {
  const collection = await dispatchCollectionRoutes(
    application,
    request,
    url,
    context,
    requestLimit,
  );
  return (
    collection ??
    dispatchThoughtRoutes(application, request, url, context, requestLimit)
  );
}

async function dispatchCollectionRoutes(
  application: LlmthinkApplicationService,
  request: IncomingMessage,
  url: URL,
  context: RequestContext,
  requestLimit: number,
): Promise<DispatchResult | undefined> {
  const method = request.method ?? "GET";
  switch (`${method} ${url.pathname}`) {
    case "POST /api/v1/audits": {
      const body = parseBody(
        auditTextSchema,
        await readJsonBody(request, requestLimit),
      );
      return {
        status: 200,
        data: await application.audit(
          { text: body.text, documentId: body.document_id },
          context,
        ),
      };
    }
    case "POST /api/v1/thoughts": {
      const body = parseBody(
        createThoughtSchema,
        await readJsonBody(request, requestLimit),
      );
      const value = await application.createThought(
        {
          thoughtId: body.thought_id,
          draftText: body.draft_text,
          identity: {
            idempotencyKey: body.idempotency_key,
            requestDigest: body.request_digest as `sha256:${string}`,
          },
        },
        context,
      );
      return { status: 201, data: projectSnapshot(value) };
    }
    case "GET /api/v1/thoughts": {
      const page = await application.listThoughts(parseListQuery(url), context);
      return {
        status: 200,
        data: {
          items: page.items.map(projectSnapshot),
          next_cursor: page.nextCursor,
        },
      };
    }
    case "POST /api/v1/thoughts/search": {
      const body = parseBody(
        searchSchema,
        await readJsonBody(request, requestLimit),
      );
      const page = await application.searchThoughts(
        {
          query: body.query,
          limit: body.limit,
          includeReflections: body.include_reflections,
          ...(body.cursor ? { cursor: body.cursor } : {}),
        },
        context,
      );
      return {
        status: 200,
        data: {
          items: page.items.map(projectSnapshot),
          next_cursor: page.nextCursor,
        },
      };
    }
  }

  return undefined;
}

async function dispatchThoughtRoutes(
  application: LlmthinkApplicationService,
  request: IncomingMessage,
  url: URL,
  context: RequestContext,
  requestLimit: number,
): Promise<DispatchResult> {
  const method = request.method ?? "GET";
  if (method === "GET") {
    const getId = routeThoughtId(url.pathname);
    if (getId)
      return {
        status: 200,
        data: projectSnapshot(
          await application.getThought(thoughtRef(context, getId), context),
        ),
      };
    const eventsId = routeThoughtId(url.pathname, "/events");
    if (eventsId)
      return {
        status: 200,
        data: {
          items: (
            await application.events(thoughtRef(context, eventsId), context)
          ).map(projectEvent),
        },
      };
  }
  const draftId = routeThoughtIdForMethod(
    method,
    "PUT",
    url.pathname,
    "/draft",
  );
  if (draftId) {
    const body = parseBody(
      saveDraftSchema,
      await readJsonBody(request, requestLimit),
    );
    const value = await application.saveDraft(
      {
        ref: thoughtRef(context, draftId),
        expectedRevision: body.expected_revision,
        draftText: body.draft_text,
        identity: {
          idempotencyKey: body.idempotency_key,
          requestDigest: body.request_digest as `sha256:${string}`,
        },
      },
      context,
    );
    return { status: 200, data: projectSnapshot(value) };
  }
  const auditId = routeThoughtIdForMethod(
    method,
    "POST",
    url.pathname,
    "/audits",
  );
  if (auditId) {
    const body = parseBody(
      recordAuditSchema,
      await readJsonBody(request, requestLimit),
    );
    const value = await application.recordAudit(
      {
        ref: thoughtRef(context, auditId),
        expectedRevision: body.expected_revision,
        report: body.report as AuditReport,
        identity: {
          idempotencyKey: body.idempotency_key,
          requestDigest: body.request_digest as `sha256:${string}`,
        },
      },
      context,
    );
    return { status: 200, data: projectSnapshot(value) };
  }
  const finalizeId = routeThoughtIdForMethod(
    method,
    "POST",
    url.pathname,
    "/finalize",
  );
  if (finalizeId) {
    const body = parseBody(
      finalizeSchema,
      await readJsonBody(request, requestLimit),
    );
    const value = await application.finalizeThought(
      {
        ref: thoughtRef(context, finalizeId),
        expectedRevision: body.expected_revision,
        finalText: body.final_text,
        confirmationToken: body.confirmation_token,
        identity: {
          idempotencyKey: body.idempotency_key,
          requestDigest: body.request_digest as `sha256:${string}`,
        },
      },
      context,
    );
    return { status: 200, data: projectSnapshot(value) };
  }
  const reflectionId = routeThoughtIdForMethod(
    method,
    "POST",
    url.pathname,
    "/reflections",
  );
  if (reflectionId) {
    const body = parseBody(
      reflectionSchema,
      await readJsonBody(request, requestLimit),
    );
    const value = await application.addReflection(
      {
        ref: thoughtRef(context, reflectionId),
        expectedRevision: body.expected_revision,
        kind: body.kind,
        text: body.text,
        identity: {
          idempotencyKey: body.idempotency_key,
          requestDigest: body.request_digest as `sha256:${string}`,
        },
      },
      context,
    );
    return { status: 200, data: projectSnapshot(value) };
  }
  throw new LlmthinkServerError("not_found", "Route not found");
}

export function createLlmthinkHttpServer(
  options: LlmthinkHttpHandlerOptions,
): Server {
  return createServer(createLlmthinkHttpHandler(options));
}
