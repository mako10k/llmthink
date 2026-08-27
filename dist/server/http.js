import { createServer, } from "node:http";
import { z } from "zod";
import { createConfidenceAssessment, parseUnitRational, rationalToString, } from "@llmthink/core";
import { LlmthinkServerError, } from "./contracts.js";
import { LlmthinkSecurityBoundary, } from "./security.js";
export const DEFAULT_HTTP_REQUEST_LIMIT_BYTES = 1024 * 1024;
export const DEFAULT_HTTP_RESPONSE_LIMIT_BYTES = 2 * 1024 * 1024;
const identitySchema = z.object({
    idempotency_key: z.string().min(1).max(200),
    request_digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
});
const revisionSchema = z.object({
    expected_revision: z.number().int().nonnegative(),
});
const rationalConfidenceSchema = z
    .string()
    .regex(/^(0|[1-9]\d{0,255})\/[1-9]\d{0,255}$/);
const confidenceAssessmentSchema = z
    .object({
    lower: rationalConfidenceSchema,
    estimate: rationalConfidenceSchema,
    upper: rationalConfidenceSchema,
    epistemic_tag: z.enum(["known", "estimated", "unknown"]),
    origin: z.enum(["explicit", "keyword", "default", "derived"]),
    profile_id: z.string().min(1),
    keyword_id: z
        .string()
        .regex(/^[A-Za-z][A-Za-z0-9_-]*$/)
        .optional(),
})
    .strict()
    .superRefine((assessment, context) => {
    try {
        const lower = parseUnitRational(assessment.lower);
        const estimate = parseUnitRational(assessment.estimate);
        const upper = parseUnitRational(assessment.upper);
        for (const [field, value, parsed] of [
            ["lower", assessment.lower, lower],
            ["estimate", assessment.estimate, estimate],
            ["upper", assessment.upper, upper],
        ]) {
            if (rationalToString(parsed) !== value) {
                context.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: [field],
                    message: "confidence rational must be in canonical reduced form",
                });
            }
        }
        createConfidenceAssessment({
            lower,
            estimate,
            upper,
            epistemicTag: assessment.epistemic_tag,
            origin: assessment.origin,
            profileId: assessment.profile_id,
            keywordId: assessment.keyword_id,
        });
    }
    catch (error) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: error instanceof Error
                ? error.message
                : "invalid confidence assessment",
        });
    }
});
const confidenceAggregationSchema = z
    .object({
    status: z.literal("unresolved_dependency"),
    baseline_method: z.literal("coordinate_min"),
    boost_applied: z.literal(false),
    boosted_estimate: z.null(),
    unresolved_nodes: z
        .array(z
        .object({
        target_id: z.string().min(1),
        parent_count: z.number().int().min(2),
    })
        .strict())
        .min(1),
})
    .strict()
    .superRefine((aggregation, context) => {
    const ids = aggregation.unresolved_nodes.map((node) => node.target_id);
    if (new Set(ids).size !== ids.length) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["unresolved_nodes"],
            message: "confidence aggregation node IDs must be unique",
        });
    }
});
const confidenceResultBaseSchema = z
    .object({
    target_id: z.string().min(1),
    node_kind: z.enum(["source", "derived"]),
    status: z.enum(["computed", "uncomputable"]),
    assessment: confidenceAssessmentSchema.optional(),
    declared_assessment: confidenceAssessmentSchema.optional(),
    declared_comparison: z
        .object({
        relation: z.enum([
            "below_derived_interval",
            "within_derived_interval",
            "above_derived_interval",
        ]),
    })
        .strict()
        .optional(),
    weakest_path: z.array(z.string().min(1)).min(1).optional(),
    aggregation: confidenceAggregationSchema.optional(),
    cause_ids: z.array(z.string().min(1)),
    reasons: z.array(z.string().min(1)),
})
    .strict();
function validateComputedConfidenceResult(result, context) {
    if (!result.assessment) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["assessment"],
            message: "computed confidence requires assessment",
        });
    }
    if (!result.weakest_path) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["weakest_path"],
            message: "computed confidence requires weakest_path",
        });
    }
    if (result.reasons.length > 0) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["reasons"],
            message: "computed confidence must not have failure reasons",
        });
    }
    validateComputedConfidencePath(result, context);
    validateConfidenceOrigin(result, context);
    if (result.node_kind === "source" && result.aggregation) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["aggregation"],
            message: "source confidence cannot have multi-parent aggregation",
        });
    }
}
function validateDeclaredConfidence(result, context) {
    if (result.status === "computed" &&
        Boolean(result.declared_assessment) !== Boolean(result.declared_comparison)) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["declared_comparison"],
            message: "computed declared confidence requires both assessment and comparison",
        });
    }
    if (result.declared_assessment &&
        !["explicit", "keyword"].includes(result.declared_assessment.origin)) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["declared_assessment", "origin"],
            message: "declared confidence origin must be explicit or keyword",
        });
    }
    if (result.node_kind === "source" && result.declared_assessment) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["declared_assessment"],
            message: "source confidence cannot have a declared derived assessment",
        });
    }
}
function validateComputedConfidencePath(result, context) {
    if (result.weakest_path &&
        result.weakest_path[result.weakest_path.length - 1] !== result.target_id) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["weakest_path"],
            message: "weakest_path must end at target_id",
        });
    }
    if (result.node_kind === "source" &&
        result.weakest_path &&
        (result.weakest_path.length !== 1 ||
            result.weakest_path[0] !== result.target_id)) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["weakest_path"],
            message: "source confidence path must contain only target_id",
        });
    }
}
function validateConfidenceOrigin(result, context) {
    if (result.assessment &&
        ((result.node_kind === "derived" &&
            result.assessment.origin !== "derived") ||
            (result.node_kind === "source" && result.assessment.origin === "derived"))) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["assessment", "origin"],
            message: "confidence origin must match node_kind",
        });
    }
}
function validateUncomputableConfidenceResult(result, context) {
    if (result.assessment ||
        result.weakest_path ||
        result.aggregation ||
        result.declared_comparison) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "uncomputable confidence must not have computed values",
        });
    }
    if (result.reasons.length === 0) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["reasons"],
            message: "uncomputable confidence requires a reason",
        });
    }
}
const confidenceResultSchema = confidenceResultBaseSchema.superRefine((result, context) => {
    validateDeclaredConfidence(result, context);
    const validate = result.status === "computed"
        ? validateComputedConfidenceResult
        : validateUncomputableConfidenceResult;
    validate(result, context);
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
    confidence_results: z.array(confidenceResultSchema).optional(),
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
const HTTP_STATUS = {
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
function invalidInput(error) {
    return new LlmthinkServerError("invalid_argument", "Request body is invalid", {
        fields: error.issues.map((issue) => issue.path.join(".")),
    });
}
function parseBody(schema, value) {
    const parsed = schema.safeParse(value);
    if (!parsed.success)
        throw invalidInput(parsed.error);
    return parsed.data;
}
async function readJsonBody(request, limit) {
    const contentType = request.headers["content-type"] ?? "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
        throw new LlmthinkServerError("invalid_argument", "Content-Type must be application/json");
    }
    const declared = Number(request.headers["content-length"]);
    if (Number.isFinite(declared) && declared > limit) {
        throw new LlmthinkServerError("payload_too_large", "Request body is too large");
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > limit) {
            throw new LlmthinkServerError("payload_too_large", "Request body is too large");
        }
        chunks.push(buffer);
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    }
    catch {
        throw new LlmthinkServerError("invalid_argument", "Request body must be valid JSON");
    }
}
function thoughtRef(context, thoughtId) {
    return {
        tenantId: context.tenantId,
        workspaceId: context.workspaceId,
        thoughtId,
    };
}
function projectReflection(value) {
    return { id: value.id, at: value.at, kind: value.kind, text: value.text };
}
function projectEvent(value) {
    return {
        at: value.at,
        kind: value.kind,
        summary: value.summary,
        ...(value.path ? { path: value.path } : {}),
    };
}
function projectSnapshot(value) {
    const snapshot = value;
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
function responseRequestId(request) {
    const value = request.headers["x-request-id"];
    return typeof value === "string" && value.length > 0 ? value : "unavailable";
}
function sendJson(response, status, value, limit) {
    if (response.destroyed || response.writableEnded)
        return;
    let body = `${JSON.stringify(value)}\n`;
    if (Buffer.byteLength(body) > limit) {
        status = HTTP_STATUS.payload_too_large;
        body = `${JSON.stringify({
            error: {
                code: "payload_too_large",
                message: "Response body is too large",
                retryable: false,
            },
            request_id: value.request_id ?? "unavailable",
        })}\n`;
    }
    response.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "content-length": Buffer.byteLength(body),
        "cache-control": "no-store",
    });
    response.end(body);
}
function success(data, requestId) {
    return { data, request_id: requestId, warnings: [] };
}
function toServerError(error) {
    return error instanceof LlmthinkServerError
        ? error
        : new LlmthinkServerError("internal", "Internal server error");
}
function errorEnvelope(error, requestId) {
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
function projectDetails(details) {
    return Object.fromEntries(Object.entries(details).map(([key, value]) => [
        key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
        value,
    ]));
}
function routeThoughtId(pathname, suffix = "") {
    const match = pathname.match(new RegExp(`^/api/v1/thoughts/([^/]+)${suffix}$`));
    if (!match?.[1])
        return undefined;
    try {
        return decodeURIComponent(match[1]);
    }
    catch {
        throw new LlmthinkServerError("invalid_argument", "Invalid route encoding");
    }
}
function routeThoughtIdForMethod(actualMethod, expectedMethod, pathname, suffix) {
    return actualMethod === expectedMethod
        ? routeThoughtId(pathname, suffix)
        : undefined;
}
function parseListQuery(url) {
    const limit = Number(url.searchParams.get("limit") ?? "20");
    const status = url.searchParams.get("status");
    if (!Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100 ||
        (status && status !== "draft" && status !== "finalized"))
        throw new LlmthinkServerError("invalid_argument", "Invalid list query");
    const cursor = url.searchParams.get("cursor");
    return {
        limit,
        ...(cursor ? { cursor } : {}),
        ...(status ? { status: status } : {}),
    };
}
function restOperation(method, pathname) {
    const verb = method ?? "GET";
    if (pathname === "/api/v1/audits")
        return `${verb} audits`;
    if (pathname === "/api/v1/thoughts")
        return `${verb} thoughts`;
    if (pathname === "/api/v1/thoughts/search")
        return `${verb} thought_search`;
    if (pathname.endsWith("/draft"))
        return `${verb} thought_draft`;
    if (pathname.endsWith("/audits"))
        return `${verb} thought_audit`;
    if (pathname.endsWith("/finalize"))
        return `${verb} thought_finalize`;
    if (pathname.endsWith("/reflections"))
        return `${verb} thought_reflection`;
    if (pathname.endsWith("/events"))
        return `${verb} thought_events`;
    if (pathname.startsWith("/api/v1/thoughts/"))
        return `${verb} thought`;
    return `${verb} unknown`;
}
export function createLlmthinkHttpHandler(options) {
    const requestLimit = options.requestLimitBytes ?? DEFAULT_HTTP_REQUEST_LIMIT_BYTES;
    const responseLimit = options.responseLimitBytes ?? DEFAULT_HTTP_RESPONSE_LIMIT_BYTES;
    const security = options.security ??
        new LlmthinkSecurityBoundary({ authenticate: options.authenticate });
    return async (request, response) => {
        let requestId = responseRequestId(request);
        try {
            const url = new URL(request.url ?? "/", "https://llmthink.invalid");
            if (request.method === "GET" && url.pathname === "/healthz") {
                sendJson(response, 200, success({ status: "ok" }, requestId), responseLimit);
                return;
            }
            if (request.method === "GET" && url.pathname === "/readyz") {
                const ready = (await options.isReady?.()) ?? true;
                sendJson(response, ready ? 200 : 503, success({ status: ready ? "ready" : "not_ready" }, requestId), responseLimit);
                return;
            }
            const context = await security.authenticate(request);
            requestId = context.requestId;
            const result = await security.execute(context, "rest", restOperation(request.method, url.pathname), () => dispatchApi(options.application, request, url, context, requestLimit));
            sendJson(response, result.status, success(result.data, requestId), responseLimit);
        }
        catch (caught) {
            const error = toServerError(caught);
            sendJson(response, HTTP_STATUS[error.code], errorEnvelope(error, requestId), responseLimit);
        }
    };
}
async function dispatchApi(application, request, url, context, requestLimit) {
    const collection = await dispatchCollectionRoutes(application, request, url, context, requestLimit);
    return (collection ??
        dispatchThoughtRoutes(application, request, url, context, requestLimit));
}
async function dispatchCollectionRoutes(application, request, url, context, requestLimit) {
    const method = request.method ?? "GET";
    switch (`${method} ${url.pathname}`) {
        case "POST /api/v1/audits": {
            const body = parseBody(auditTextSchema, await readJsonBody(request, requestLimit));
            return {
                status: 200,
                data: await application.audit({ text: body.text, documentId: body.document_id }, context),
            };
        }
        case "POST /api/v1/thoughts": {
            const body = parseBody(createThoughtSchema, await readJsonBody(request, requestLimit));
            const value = await application.createThought({
                thoughtId: body.thought_id,
                draftText: body.draft_text,
                identity: {
                    idempotencyKey: body.idempotency_key,
                    requestDigest: body.request_digest,
                },
            }, context);
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
            const body = parseBody(searchSchema, await readJsonBody(request, requestLimit));
            const page = await application.searchThoughts({
                query: body.query,
                limit: body.limit,
                includeReflections: body.include_reflections,
                ...(body.cursor ? { cursor: body.cursor } : {}),
            }, context);
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
async function dispatchThoughtRoutes(application, request, url, context, requestLimit) {
    const method = request.method ?? "GET";
    if (method === "GET") {
        const getId = routeThoughtId(url.pathname);
        if (getId)
            return {
                status: 200,
                data: projectSnapshot(await application.getThought(thoughtRef(context, getId), context)),
            };
        const eventsId = routeThoughtId(url.pathname, "/events");
        if (eventsId)
            return {
                status: 200,
                data: {
                    items: (await application.events(thoughtRef(context, eventsId), context)).map(projectEvent),
                },
            };
    }
    const draftId = routeThoughtIdForMethod(method, "PUT", url.pathname, "/draft");
    if (draftId) {
        const body = parseBody(saveDraftSchema, await readJsonBody(request, requestLimit));
        const value = await application.saveDraft({
            ref: thoughtRef(context, draftId),
            expectedRevision: body.expected_revision,
            draftText: body.draft_text,
            identity: {
                idempotencyKey: body.idempotency_key,
                requestDigest: body.request_digest,
            },
        }, context);
        return { status: 200, data: projectSnapshot(value) };
    }
    const auditId = routeThoughtIdForMethod(method, "POST", url.pathname, "/audits");
    if (auditId) {
        const body = parseBody(recordAuditSchema, await readJsonBody(request, requestLimit));
        const value = await application.recordAudit({
            ref: thoughtRef(context, auditId),
            expectedRevision: body.expected_revision,
            report: body.report,
            identity: {
                idempotencyKey: body.idempotency_key,
                requestDigest: body.request_digest,
            },
        }, context);
        return { status: 200, data: projectSnapshot(value) };
    }
    const finalizeId = routeThoughtIdForMethod(method, "POST", url.pathname, "/finalize");
    if (finalizeId) {
        const body = parseBody(finalizeSchema, await readJsonBody(request, requestLimit));
        const value = await application.finalizeThought({
            ref: thoughtRef(context, finalizeId),
            expectedRevision: body.expected_revision,
            finalText: body.final_text,
            confirmationToken: body.confirmation_token,
            identity: {
                idempotencyKey: body.idempotency_key,
                requestDigest: body.request_digest,
            },
        }, context);
        return { status: 200, data: projectSnapshot(value) };
    }
    const reflectionId = routeThoughtIdForMethod(method, "POST", url.pathname, "/reflections");
    if (reflectionId) {
        const body = parseBody(reflectionSchema, await readJsonBody(request, requestLimit));
        const value = await application.addReflection({
            ref: thoughtRef(context, reflectionId),
            expectedRevision: body.expected_revision,
            kind: body.kind,
            text: body.text,
            identity: {
                idempotencyKey: body.idempotency_key,
                requestDigest: body.request_digest,
            },
        }, context);
        return { status: 200, data: projectSnapshot(value) };
    }
    throw new LlmthinkServerError("not_found", "Route not found");
}
export function createLlmthinkHttpServer(options) {
    return createServer(createLlmthinkHttpHandler(options));
}
//# sourceMappingURL=http.js.map