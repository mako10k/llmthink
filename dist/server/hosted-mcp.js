import { createServer, } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { LlmthinkServerError, } from "./contracts.js";
import { LlmthinkSecurityBoundary } from "./security.js";
export const DEFAULT_MCP_REQUEST_LIMIT_BYTES = 1024 * 1024;
export const DEFAULT_MCP_TEXT_LIMIT_BYTES = 64 * 1024;
const identityShape = {
    idempotency_key: z.string().min(1).max(200),
    request_digest: z.custom((value) => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value)),
};
const revisionShape = { expected_revision: z.number().int().nonnegative() };
const thoughtIdShape = { thought_id: z.string().min(1).max(128) };
const READ_ONLY = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
};
const WRITE = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
};
const CONSEQUENTIAL_WRITE = {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
};
function ref(context, thoughtId) {
    return {
        tenantId: context.tenantId,
        workspaceId: context.workspaceId,
        thoughtId,
    };
}
function snapshot(value) {
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
function boundedText(value, limit) {
    const text = JSON.stringify(value, null, 2);
    if (Buffer.byteLength(text) <= limit)
        return text;
    return JSON.stringify({
        truncated: true,
        message: "Structured result exceeds text presentation limit",
    });
}
function toolResult(value, limit) {
    return {
        content: [{ type: "text", text: boundedText(value, limit) }],
        structuredContent: value,
    };
}
function toolError(error, limit) {
    const serverError = error instanceof LlmthinkServerError
        ? error
        : new LlmthinkServerError("internal", "Internal server error");
    const value = {
        error: {
            code: serverError.code,
            message: serverError.message,
            retryable: serverError.retryable,
            ...(serverError.details ? { details: serverError.details } : {}),
        },
    };
    return { ...toolResult(value, limit), isError: true };
}
function registerTools(server, application, context, textLimit, security) {
    const run = async (operation, action) => {
        try {
            return toolResult(await security.execute(context, "mcp", operation, action), textLimit);
        }
        catch (error) {
            return toolError(error, textLimit);
        }
    };
    server.registerTool("audit_thought", {
        description: "Audit LLMThink text without persisting it.",
        inputSchema: {
            text: z.string().min(1),
            document_id: z.string().optional(),
        },
        annotations: READ_ONLY,
    }, ({ text, document_id }) => run("audit_thought", async () => ({
        ...(await application.audit({ text, documentId: document_id }, context)),
    })));
    server.registerTool("create_thought_draft", {
        description: "Create a new thought draft with an idempotent command identity.",
        inputSchema: {
            ...thoughtIdShape,
            draft_text: z.string(),
            ...identityShape,
        },
        annotations: WRITE,
    }, ({ thought_id, draft_text, idempotency_key, request_digest }) => run("create_thought_draft", async () => snapshot(await application.createThought({
        thoughtId: thought_id,
        draftText: draft_text,
        identity: {
            idempotencyKey: idempotency_key,
            requestDigest: request_digest,
        },
    }, context))));
    server.registerTool("get_thought", {
        description: "Get one thought snapshot.",
        inputSchema: thoughtIdShape,
        annotations: READ_ONLY,
    }, ({ thought_id }) => run("get_thought", async () => snapshot(await application.getThought(ref(context, thought_id), context))));
    server.registerTool("list_thoughts", {
        description: "List thought snapshots in the authenticated workspace.",
        inputSchema: {
            cursor: z.string().optional(),
            limit: z.number().int().min(1).max(100).default(20),
            status: z.enum(["draft", "finalized"]).optional(),
        },
        annotations: READ_ONLY,
    }, ({ cursor, limit, status }) => run("list_thoughts", async () => {
        const page = await application.listThoughts({ cursor, limit, status }, context);
        return {
            items: page.items.map(snapshot),
            next_cursor: page.nextCursor,
        };
    }));
    server.registerTool("search_thoughts", {
        description: "Search thoughts in the authenticated workspace.",
        inputSchema: {
            query: z.string().min(1),
            cursor: z.string().optional(),
            limit: z.number().int().min(1).max(100).default(20),
            include_reflections: z.boolean().default(false),
        },
        annotations: READ_ONLY,
    }, ({ query, cursor, limit, include_reflections }) => run("search_thoughts", async () => {
        const page = await application.searchThoughts({ query, cursor, limit, includeReflections: include_reflections }, context);
        return {
            items: page.items.map(snapshot),
            next_cursor: page.nextCursor,
        };
    }));
    server.registerTool("finalize_thought", {
        description: "Finalize a thought after explicit confirmation.",
        inputSchema: {
            ...thoughtIdShape,
            ...revisionShape,
            final_text: z.string(),
            confirmation_token: z.string(),
            ...identityShape,
        },
        annotations: CONSEQUENTIAL_WRITE,
    }, ({ thought_id, expected_revision, final_text, confirmation_token, idempotency_key, request_digest, }) => run("finalize_thought", async () => snapshot(await application.finalizeThought({
        ref: ref(context, thought_id),
        expectedRevision: expected_revision,
        finalText: final_text,
        confirmationToken: confirmation_token,
        identity: {
            idempotencyKey: idempotency_key,
            requestDigest: request_digest,
        },
    }, context))));
    server.registerTool("add_thought_reflection", {
        description: "Append a reflection to a thought.",
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
    }, ({ thought_id, expected_revision, kind, text, idempotency_key, request_digest, }) => run("add_thought_reflection", async () => snapshot(await application.addReflection({
        ref: ref(context, thought_id),
        expectedRevision: expected_revision,
        kind,
        text,
        identity: {
            idempotencyKey: idempotency_key,
            requestDigest: request_digest,
        },
    }, context))));
    server.registerTool("get_thought_history", {
        description: "Get the append-only event history for a thought.",
        inputSchema: thoughtIdShape,
        annotations: READ_ONLY,
    }, ({ thought_id }) => run("get_thought_history", async () => ({
        events: await application.events(ref(context, thought_id), context),
    })));
}
async function readBoundedJson(request, limit) {
    const declared = Number(request.headers["content-length"]);
    if (Number.isFinite(declared) && declared > limit) {
        throw new LlmthinkServerError("payload_too_large", "MCP request body is too large");
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > limit)
            throw new LlmthinkServerError("payload_too_large", "MCP request body is too large");
        chunks.push(buffer);
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    }
    catch {
        throw new LlmthinkServerError("invalid_argument", "MCP request body must be valid JSON");
    }
}
function sendRpcError(response, status, error) {
    if (response.destroyed || response.writableEnded)
        return;
    const value = error instanceof LlmthinkServerError
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
function errorStatus(error) {
    if (!(error instanceof LlmthinkServerError))
        return 500;
    if (error.code === "unauthenticated")
        return 401;
    if (error.code === "forbidden")
        return 403;
    if (error.code === "payload_too_large")
        return 413;
    if (error.code === "rate_limited")
        return 429;
    return 400;
}
function mcpOperation(body) {
    if (!body || typeof body !== "object")
        return "invalid";
    const message = body;
    if (message.method === "initialize")
        return "initialize";
    if (message.method === "tools/list")
        return "tools_list";
    if (message.method === "tools/call") {
        const name = message.params?.name;
        return typeof name === "string" && MCP_TOOL_NAMES.has(name)
            ? `tools_call ${name}`
            : "tools_call unknown";
    }
    return "unknown";
}
const MCP_TOOL_NAMES = new Set([
    "audit_thought",
    "create_thought_draft",
    "get_thought",
    "list_thoughts",
    "search_thoughts",
    "finalize_thought",
    "add_thought_reflection",
    "get_thought_history",
]);
async function handleMcpRequest(request, response, options, requestLimit, textLimit, security) {
    let transport;
    let server;
    try {
        const context = await security.authenticate(request);
        const body = request.method === "POST"
            ? await readBoundedJson(request, requestLimit)
            : undefined;
        server = new McpServer({ name: "llmthink-hosted", version: "1.2.0" });
        registerTools(server, options.application, context, textLimit, security);
        transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true,
        });
        const activeTransport = transport;
        await server.connect(activeTransport);
        await security.execute(context, "mcp", mcpOperation(body), () => activeTransport.handleRequest(request, response, body));
    }
    catch (error) {
        sendRpcError(response, errorStatus(error), error);
    }
    finally {
        await transport?.close().catch(() => undefined);
        await server?.close().catch(() => undefined);
    }
}
export function createLlmthinkHostedMcpHandler(options) {
    const requestLimit = options.requestLimitBytes ?? DEFAULT_MCP_REQUEST_LIMIT_BYTES;
    const textLimit = options.textLimitBytes ?? DEFAULT_MCP_TEXT_LIMIT_BYTES;
    const security = options.security ??
        new LlmthinkSecurityBoundary({ authenticate: options.authenticate });
    return async (request, response) => {
        const pathname = new URL(request.url ?? "/", "https://llmthink.invalid")
            .pathname;
        if (pathname !== "/mcp") {
            sendRpcError(response, 404, new LlmthinkServerError("not_found", "MCP endpoint not found"));
            return;
        }
        await handleMcpRequest(request, response, options, requestLimit, textLimit, security);
    };
}
export function createLlmthinkHostedMcpServer(options) {
    return createServer(createLlmthinkHostedMcpHandler(options));
}
//# sourceMappingURL=hosted-mcp.js.map