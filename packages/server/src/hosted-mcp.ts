import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { createHash } from "node:crypto";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

import { LlmthinkApplicationService } from "./application-service.js";
import {
  LLMTHINK_SERVER_ERROR_CODES,
  LlmthinkServerError,
  type RequestContext,
  type ServerThoughtSnapshot,
  type ThoughtRef,
} from "./contracts.js";
import type { LlmthinkHttpAuthenticator } from "./http.js";
import { HOSTED_MCP_TOOL_NAMES } from "./hosted-mcp-surface.js";
import {
  errorNavigation,
  EXTERNAL_STORAGE_NOTICE,
  mcpHelp,
  REQUEST_DIGEST_DESCRIPTION,
  REQUEST_DIGEST_PATTERN,
} from "./mcp-guidance.js";
import {
  assertVerifiedRequestContext,
  InMemoryLlmthinkRateLimiter,
  LlmthinkSecurityBoundary,
} from "./security.js";

export const DEFAULT_MCP_REQUEST_LIMIT_BYTES = 1024 * 1024;
export const DEFAULT_MCP_TEXT_LIMIT_BYTES = 64 * 1024;

export interface LlmthinkOnboardingPrincipal {
  readonly identity: {
    readonly issuer: string;
    readonly subjectId: string;
    readonly organizationId?: string;
  };
  readonly requestId: string;
}

export interface LlmthinkOnboardingMcpOptions {
  readonly authenticate: (
    request: IncomingMessage,
  ) => Promise<LlmthinkOnboardingPrincipal>;
  readonly issueUrl: (principal: LlmthinkOnboardingPrincipal) => string;
}

export interface LlmthinkHostedMcpHandlerOptions {
  readonly application: LlmthinkApplicationService;
  readonly authenticate: LlmthinkHttpAuthenticator;
  readonly security?: LlmthinkSecurityBoundary;
  readonly requestLimitBytes?: number;
  readonly textLimitBytes?: number;
  readonly onboardingMcp?: LlmthinkOnboardingMcpOptions;
}

const identityShape = {
  idempotency_key: z.string().min(1).max(200),
  request_digest: z
    .string()
    .regex(
      new RegExp(REQUEST_DIGEST_PATTERN),
      "expected sha256:<64 lowercase hex>",
    )
    .describe(REQUEST_DIGEST_DESCRIPTION) as z.ZodType<`sha256:${string}`>,
};
const revisionShape = { expected_revision: z.number().int().nonnegative() };
const thoughtIdShape = { thought_id: z.string().min(1).max(128) };

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
const CONSEQUENTIAL_WRITE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
} as const;

function ref(context: RequestContext, thoughtId: string): ThoughtRef {
  return {
    tenantId: context.tenantId,
    workspaceId: context.workspaceId,
    thoughtId,
  };
}

function snapshot(value: ServerThoughtSnapshot): Record<string, unknown> {
  return {
    tenant_id: value.tenantId,
    workspace_id: value.workspaceId,
    thought_id: value.record.id,
    revision: value.revision,
    status: value.record.status,
    created_at: value.record.created_at,
    updated_at: value.record.updated_at,
    draft_text: value.draftText,
    final_text: value.finalText,
    latest_audit: value.latestAudit,
    history: value.history,
    reflections: value.reflections,
  };
}

function boundedText(value: unknown, limit: number): string {
  const text = JSON.stringify(value, null, 2);
  if (Buffer.byteLength(text) <= limit) return text;
  return JSON.stringify({
    truncated: true,
    message: "Structured result exceeds text presentation limit",
  });
}

function toolResult(value: Record<string, unknown>, limit: number) {
  return {
    content: [{ type: "text" as const, text: boundedText(value, limit) }],
    structuredContent: value,
  };
}

function toolError(error: unknown, limit: number) {
  const serverError =
    error instanceof LlmthinkServerError
      ? error
      : new LlmthinkServerError("internal", "Internal server error");
  const value = {
    error: {
      code: serverError.code,
      message: serverError.message,
      retryable: serverError.retryable,
      ...(serverError.details ? { details: serverError.details } : {}),
      navigation: errorNavigation(serverError.code),
    },
  };
  return { ...toolResult(value, limit), isError: true };
}

function registerTools(
  server: McpServer,
  application: LlmthinkApplicationService,
  context: RequestContext,
  textLimit: number,
  security: LlmthinkSecurityBoundary,
): void {
  const run = async (
    operation: string,
    action: () => Promise<Record<string, unknown>>,
  ) => {
    try {
      return toolResult(
        await security.execute(context, "mcp", operation, action),
        textLimit,
      );
    } catch (error) {
      return toolError(error, textLimit);
    }
  };

  server.registerTool(
    HOSTED_MCP_TOOL_NAMES.help,
    {
      description:
        "Get CLI-equivalent LLMThink tool, error-recovery, DSL, storage, and authentication guidance.",
      inputSchema: {
        topic: z
          .enum(["overview", "tools", "errors", "dsl", "storage", "auth"])
          .default("overview"),
        tool: z
          .enum([
            HOSTED_MCP_TOOL_NAMES.audit,
            HOSTED_MCP_TOOL_NAMES.create,
            HOSTED_MCP_TOOL_NAMES.get,
            HOSTED_MCP_TOOL_NAMES.list,
            HOSTED_MCP_TOOL_NAMES.search,
            HOSTED_MCP_TOOL_NAMES.finalize,
            HOSTED_MCP_TOOL_NAMES.reflect,
            HOSTED_MCP_TOOL_NAMES.delete,
            HOSTED_MCP_TOOL_NAMES.history,
          ])
          .optional(),
        error_code: z.enum(LLMTHINK_SERVER_ERROR_CODES).optional(),
        dsl_topic: z.string().optional(),
      },
      annotations: READ_ONLY,
    },
    ({ topic, tool, error_code, dsl_topic }) =>
      run(HOSTED_MCP_TOOL_NAMES.help, async () =>
        mcpHelp({
          topic,
          tool,
          errorCode: error_code,
          dslTopic: dsl_topic,
        }),
      ),
  );
  server.registerTool(
    HOSTED_MCP_TOOL_NAMES.audit,
    {
      description:
        "Audit LLMThink text without persisting it. Authentication confines execution to the logged-in account boundary.",
      inputSchema: {
        text: z.string().min(1),
        document_id: z.string().optional(),
      },
      annotations: READ_ONLY,
    },
    ({ text, document_id }) =>
      run(HOSTED_MCP_TOOL_NAMES.audit, async () => ({
        ...(await application.audit(
          { text, documentId: document_id },
          context,
        )),
      })),
  );
  server.registerTool(
    HOSTED_MCP_TOOL_NAMES.create,
    {
      description: `Create and externally persist a draft in the authenticated llmthink tenant/workspace. ${EXTERNAL_STORAGE_NOTICE}`,
      inputSchema: {
        ...thoughtIdShape,
        draft_text: z.string(),
        ...identityShape,
      },
      annotations: WRITE,
    },
    ({ thought_id, draft_text, idempotency_key, request_digest }) =>
      run(HOSTED_MCP_TOOL_NAMES.create, async () =>
        snapshot(
          await application.createThought(
            {
              thoughtId: thought_id,
              draftText: draft_text,
              identity: {
                idempotencyKey: idempotency_key,
                requestDigest: request_digest,
              },
            },
            context,
          ),
        ),
      ),
  );
  server.registerTool(
    HOSTED_MCP_TOOL_NAMES.get,
    {
      description:
        "Get one thought snapshot from the authenticated llmthink tenant/workspace.",
      inputSchema: thoughtIdShape,
      annotations: READ_ONLY,
    },
    ({ thought_id }) =>
      run(HOSTED_MCP_TOOL_NAMES.get, async () =>
        snapshot(
          await application.getThought(ref(context, thought_id), context),
        ),
      ),
  );
  server.registerTool(
    HOSTED_MCP_TOOL_NAMES.list,
    {
      description:
        "List thought snapshots in the authenticated llmthink workspace.",
      inputSchema: {
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(20),
        status: z.enum(["draft", "finalized"]).optional(),
      },
      annotations: READ_ONLY,
    },
    ({ cursor, limit, status }) =>
      run(HOSTED_MCP_TOOL_NAMES.list, async () => {
        const page = await application.listThoughts(
          { cursor, limit, status },
          context,
        );
        return {
          items: page.items.map(snapshot),
          next_cursor: page.nextCursor,
        };
      }),
  );
  server.registerTool(
    HOSTED_MCP_TOOL_NAMES.search,
    {
      description: "Search thoughts in the authenticated llmthink workspace.",
      inputSchema: {
        query: z.string().min(1),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(20),
        include_reflections: z.boolean().default(false),
      },
      annotations: READ_ONLY,
    },
    ({ query, cursor, limit, include_reflections }) =>
      run(HOSTED_MCP_TOOL_NAMES.search, async () => {
        const page = await application.searchThoughts(
          { query, cursor, limit, includeReflections: include_reflections },
          context,
        );
        return {
          items: page.items.map(snapshot),
          next_cursor: page.nextCursor,
        };
      }),
  );
  server.registerTool(
    HOSTED_MCP_TOOL_NAMES.finalize,
    {
      description: `Finalize and externally persist the current thought when finalization is the user's current request. Do not require a second confirmation exchange. ${EXTERNAL_STORAGE_NOTICE}`,
      inputSchema: {
        ...thoughtIdShape,
        ...revisionShape,
        final_text: z.string(),
        confirmation_token: z.string().optional(),
        ...identityShape,
      },
      annotations: CONSEQUENTIAL_WRITE,
    },
    ({
      thought_id,
      expected_revision,
      final_text,
      confirmation_token,
      idempotency_key,
      request_digest,
    }) =>
      run(HOSTED_MCP_TOOL_NAMES.finalize, async () =>
        snapshot(
          await application.finalizeThought(
            {
              ref: ref(context, thought_id),
              expectedRevision: expected_revision,
              finalText: final_text,
              confirmationToken: confirmation_token ?? "mcp-direct-user-intent",
              identity: {
                idempotencyKey: idempotency_key,
                requestDigest: request_digest,
              },
            },
            context,
          ),
        ),
      ),
  );
  server.registerTool(
    HOSTED_MCP_TOOL_NAMES.reflect,
    {
      description: `Append and externally persist a reflection in the authenticated llmthink tenant/workspace. ${EXTERNAL_STORAGE_NOTICE}`,
      inputSchema: {
        ...thoughtIdShape,
        ...revisionShape,
        kind: z.enum([
          "note",
          "concern",
          "decision",
          "follow_up",
          "audit_response",
        ]),
        text: z.string().min(1),
        ...identityShape,
      },
      annotations: WRITE,
    },
    ({
      thought_id,
      expected_revision,
      kind,
      text,
      idempotency_key,
      request_digest,
    }) =>
      run(HOSTED_MCP_TOOL_NAMES.reflect, async () =>
        snapshot(
          await application.addReflection(
            {
              ref: ref(context, thought_id),
              expectedRevision: expected_revision,
              kind,
              text,
              identity: {
                idempotencyKey: idempotency_key,
                requestDigest: request_digest,
              },
            },
            context,
          ),
        ),
      ),
  );
  server.registerTool(
    HOSTED_MCP_TOOL_NAMES.delete,
    {
      description:
        "Permanently delete one thought from the authenticated tenant/workspace. Requires the current revision and a unique idempotency identity.",
      inputSchema: {
        ...thoughtIdShape,
        ...revisionShape,
        ...identityShape,
      },
      annotations: CONSEQUENTIAL_WRITE,
    },
    ({ thought_id, expected_revision, idempotency_key, request_digest }) =>
      run(HOSTED_MCP_TOOL_NAMES.delete, async () => ({
        ...(await application.deleteThought(
          {
            ref: ref(context, thought_id),
            expectedRevision: expected_revision,
            identity: {
              idempotencyKey: idempotency_key,
              requestDigest: request_digest,
            },
          },
          context,
        )),
      })),
  );
  server.registerTool(
    HOSTED_MCP_TOOL_NAMES.history,
    {
      description:
        "Get the append-only event history from the authenticated llmthink tenant/workspace.",
      inputSchema: thoughtIdShape,
      annotations: READ_ONLY,
    },
    ({ thought_id }) =>
      run(HOSTED_MCP_TOOL_NAMES.history, async () => ({
        events: await application.events(ref(context, thought_id), context),
      })),
  );
}

function onboardingContext(
  principal: LlmthinkOnboardingPrincipal,
): RequestContext {
  const digest = createHash("sha256")
    .update(principal.identity.issuer)
    .update("\0")
    .update(principal.identity.subjectId)
    .update("\0")
    .update(principal.identity.organizationId ?? "")
    .digest("hex");
  return {
    subjectId: `onboarding-${digest.slice(0, 32)}`,
    tenantId: `onboarding-${digest.slice(0, 32)}`,
    workspaceId: `onboarding-${digest.slice(0, 32)}`,
    scopes: [],
    requestId: principal.requestId,
  };
}

function registerOnboardingTool(
  server: McpServer,
  principal: LlmthinkOnboardingPrincipal,
  issueUrl: (principal: LlmthinkOnboardingPrincipal) => string,
  textLimit: number,
): void {
  server.registerTool(
    HOSTED_MCP_TOOL_NAMES.onboarding,
    {
      description:
        "Create a short-lived, single-use browser link to review and explicitly accept the current llmthink terms. This does not itself record agreement or create a tenant.",
      inputSchema: {},
      annotations: WRITE,
    },
    async () =>
      toolResult(
        {
          onboarding_url: issueUrl(principal),
          expires_in_seconds: 600,
          agreement_recorded: false,
        },
        textLimit,
      ),
  );
}

async function readBoundedJson(
  request: IncomingMessage,
  limit: number,
): Promise<unknown> {
  const declared = Number(request.headers["content-length"]);
  if (Number.isFinite(declared) && declared > limit) {
    throw new LlmthinkServerError(
      "payload_too_large",
      "MCP request body is too large",
    );
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit)
      throw new LlmthinkServerError(
        "payload_too_large",
        "MCP request body is too large",
      );
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new LlmthinkServerError(
      "invalid_argument",
      "MCP request body must be valid JSON",
    );
  }
}

function sendRpcError(
  response: ServerResponse,
  status: number,
  error: unknown,
): void {
  if (response.destroyed || response.writableEnded) return;
  const value =
    error instanceof LlmthinkServerError
      ? error
      : new LlmthinkServerError("internal", "Internal server error");
  const body = `${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32000, message: value.message, data: { code: value.code, retryable: value.retryable } } })}\n`;
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
}

function errorStatus(error: unknown): number {
  if (!(error instanceof LlmthinkServerError)) return 500;
  if (error.code === "unauthenticated") return 401;
  if (error.code === "forbidden") return 403;
  if (error.code === "payload_too_large") return 413;
  if (error.code === "rate_limited") return 429;
  return 400;
}

function mcpOperation(body: unknown): string {
  if (!body || typeof body !== "object") return "invalid";
  const message = body as {
    method?: unknown;
    params?: { name?: unknown };
  };
  if (message.method === "initialize") return "initialize";
  if (message.method === "tools/list") return "tools_list";
  if (message.method === "tools/call") {
    const name = message.params?.name;
    return typeof name === "string" && MCP_TOOL_NAMES.has(name)
      ? `tools_call ${name}`
      : "tools_call unknown";
  }
  return "unknown";
}

const MCP_TOOL_NAMES = new Set<string>(Object.values(HOSTED_MCP_TOOL_NAMES));

async function handleMcpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: LlmthinkHostedMcpHandlerOptions,
  requestLimit: number,
  textLimit: number,
  security: LlmthinkSecurityBoundary,
  onboardingRateLimiter: InMemoryLlmthinkRateLimiter,
): Promise<void> {
  let transport: StreamableHTTPServerTransport | undefined;
  let server: McpServer | undefined;
  try {
    let context: RequestContext;
    let onboardingPrincipal: LlmthinkOnboardingPrincipal | undefined;
    try {
      context = await security.authenticate(request);
    } catch (authenticationError) {
      if (!options.onboardingMcp) throw authenticationError;
      try {
        onboardingPrincipal = await options.onboardingMcp.authenticate(request);
      } catch {
        throw authenticationError;
      }
      context = onboardingContext(onboardingPrincipal);
      assertVerifiedRequestContext(context);
      onboardingRateLimiter.check(context, Date.now());
    }
    const body =
      request.method === "POST"
        ? await readBoundedJson(request, requestLimit)
        : undefined;
    server = new McpServer({ name: "llmthink-hosted", version: "1.3.0" });
    if (onboardingPrincipal && options.onboardingMcp) {
      registerOnboardingTool(
        server,
        onboardingPrincipal,
        options.onboardingMcp.issueUrl,
        textLimit,
      );
    } else {
      registerTools(server, options.application, context, textLimit, security);
    }
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const activeTransport = transport;
    await server.connect(activeTransport);
    await security.execute(context, "mcp", mcpOperation(body), () =>
      activeTransport.handleRequest(request, response, body),
    );
  } catch (error) {
    sendRpcError(response, errorStatus(error), error);
  } finally {
    await transport?.close().catch(() => undefined);
    await server?.close().catch(() => undefined);
  }
}

export function createLlmthinkHostedMcpHandler(
  options: LlmthinkHostedMcpHandlerOptions,
) {
  const requestLimit =
    options.requestLimitBytes ?? DEFAULT_MCP_REQUEST_LIMIT_BYTES;
  const textLimit = options.textLimitBytes ?? DEFAULT_MCP_TEXT_LIMIT_BYTES;
  const security =
    options.security ??
    new LlmthinkSecurityBoundary({ authenticate: options.authenticate });
  const onboardingRateLimiter = new InMemoryLlmthinkRateLimiter();
  return async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    const pathname = new URL(request.url ?? "/", "https://llmthink.invalid")
      .pathname;
    if (pathname !== "/mcp") {
      sendRpcError(
        response,
        404,
        new LlmthinkServerError("not_found", "MCP endpoint not found"),
      );
      return;
    }
    await handleMcpRequest(
      request,
      response,
      options,
      requestLimit,
      textLimit,
      security,
      onboardingRateLimiter,
    );
  };
}

export function createLlmthinkHostedMcpServer(
  options: LlmthinkHostedMcpHandlerOptions,
): Server {
  return createServer(createLlmthinkHostedMcpHandler(options));
}
