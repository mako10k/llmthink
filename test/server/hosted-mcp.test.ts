import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createLlmthinkHostedMcpServer,
  LlmthinkApplicationService,
  LlmthinkServerError,
  ServerFileThoughtRepository,
  type LlmthinkServerScope,
  type RequestContext,
} from "../../src/index.js";

const DIGEST_A = `sha256:${"a".repeat(64)}`;
const DIGEST_B = `sha256:${"b".repeat(64)}`;

interface Fixture {
  readonly baseUrl: string;
}

interface RpcBody {
  readonly result: {
    readonly serverInfo: { readonly name: string };
    readonly tools: Array<{
      name: string;
      annotations: Record<string, boolean>;
    }>;
    readonly isError?: boolean;
    readonly structuredContent: {
      readonly persisted?: boolean;
      readonly report?: { readonly document_id?: string };
      readonly items?: readonly unknown[];
      readonly revision?: number;
      readonly draft_text?: string;
      readonly error?: { readonly code: string };
    };
  };
  readonly error: { readonly data: { readonly code: string } };
}

async function fixture(
  t: test.TestContext,
  requestLimitBytes?: number,
): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "llmthink-hosted-mcp-"));
  const application = new LlmthinkApplicationService({
    repository: new ServerFileThoughtRepository({ dataRoot: root }),
  });
  const server = createLlmthinkHostedMcpServer({
    application,
    requestLimitBytes,
    authenticate: async (request): Promise<RequestContext> => {
      if (request.headers.authorization !== "Bearer test") {
        throw new LlmthinkServerError(
          "unauthenticated",
          "Authentication required",
        );
      }
      return {
        subjectId: "user-1",
        tenantId: "tenant-1",
        workspaceId: "workspace-1",
        scopes: String(request.headers["x-scopes"] ?? "")
          .split(",")
          .filter(Boolean) as LlmthinkServerScope[],
        requestId: String(request.headers["x-request-id"] ?? "mcp-request-1"),
      };
    },
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  t.after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(root, { recursive: true, force: true });
  });
  return { baseUrl: `http://127.0.0.1:${port}` };
}

function headers(
  scopes: readonly LlmthinkServerScope[] = [],
): Record<string, string> {
  return {
    authorization: "Bearer test",
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "x-request-id": "mcp-request-1",
    "x-scopes": scopes.join(","),
  };
}

async function rpc(
  baseUrl: string,
  method: string,
  params: Record<string, unknown>,
  scopes: readonly LlmthinkServerScope[] = [],
  id = 1,
): Promise<{ response: Response; body: RpcBody }> {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: headers(scopes),
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  return { response, body: (await response.json()) as RpcBody };
}

async function callTool(
  baseUrl: string,
  name: string,
  args: Record<string, unknown>,
  scopes: readonly LlmthinkServerScope[],
) {
  return rpc(baseUrl, "tools/call", { name, arguments: args }, scopes);
}

test("hosted MCP initializes and publishes eight goal-oriented tools with effect annotations", async (t) => {
  const { baseUrl } = await fixture(t);
  const initialized = await rpc(baseUrl, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test", version: "1" },
  });
  assert.equal(initialized.response.status, 200);
  assert.equal(initialized.body.result.serverInfo.name, "llmthink-hosted");

  const listed = await rpc(baseUrl, "tools/list", {});
  const tools = listed.body.result.tools as Array<{
    name: string;
    annotations: Record<string, boolean>;
  }>;
  assert.deepEqual(
    tools.map((tool) => tool.name),
    [
      "audit_thought",
      "create_thought_draft",
      "get_thought",
      "list_thoughts",
      "search_thoughts",
      "finalize_thought",
      "add_thought_reflection",
      "get_thought_history",
    ],
  );
  assert.equal(
    tools.find((tool) => tool.name === "audit_thought")?.annotations
      .readOnlyHint,
    true,
  );
  assert.equal(
    tools.find((tool) => tool.name === "finalize_thought")?.annotations
      .destructiveHint,
    true,
  );
  assert.equal(
    tools.some((tool) => tool.name.includes("delete")),
    false,
  );
});

test("pure audit returns structured content and does not persist", async (t) => {
  const { baseUrl } = await fixture(t);
  const audit = await callTool(
    baseUrl,
    "audit_thought",
    { text: 'problem P1:\n  "question"', document_id: "doc-1" },
    ["audit:run"],
  );
  assert.equal(audit.body.result.structuredContent.persisted, false);
  assert.equal(audit.body.result.structuredContent.report.document_id, "doc-1");

  const list = await callTool(baseUrl, "list_thoughts", { limit: 20 }, [
    "thought:read",
  ]);
  assert.deepEqual(list.body.result.structuredContent.items, []);
});

test("write and read tools share Application Service state without REST loopback", async (t) => {
  const { baseUrl } = await fixture(t);
  const created = await callTool(
    baseUrl,
    "create_thought_draft",
    {
      thought_id: "thought-1",
      draft_text: "needle",
      idempotency_key: "create-1",
      request_digest: DIGEST_A,
    },
    ["thought:write"],
  );
  assert.equal(created.body.result.structuredContent.revision, 1);

  const got = await callTool(
    baseUrl,
    "get_thought",
    { thought_id: "thought-1" },
    ["thought:read"],
  );
  assert.equal(got.body.result.structuredContent.draft_text, "needle");
  const searched = await callTool(
    baseUrl,
    "search_thoughts",
    { query: "needle", limit: 20, include_reflections: false },
    ["thought:read"],
  );
  assert.equal(searched.body.result.structuredContent.items.length, 1);
});

test("authorization, schema, revision, idempotency, and confirmation failures are structured", async (t) => {
  const { baseUrl } = await fixture(t);
  const denied = await callTool(baseUrl, "list_thoughts", { limit: 20 }, []);
  assert.equal(denied.body.result.isError, true);
  assert.equal(denied.body.result.structuredContent.error.code, "forbidden");

  const invalid = await callTool(baseUrl, "get_thought", {}, ["thought:read"]);
  assert.equal(invalid.body.result.isError, true);

  await callTool(
    baseUrl,
    "create_thought_draft",
    {
      thought_id: "thought-1",
      draft_text: "draft",
      idempotency_key: "create-1",
      request_digest: DIGEST_A,
    },
    ["thought:write"],
  );
  const confirmation = await callTool(
    baseUrl,
    "finalize_thought",
    {
      thought_id: "thought-1",
      expected_revision: 1,
      final_text: "final",
      confirmation_token: "",
      idempotency_key: "final-1",
      request_digest: DIGEST_B,
    },
    ["thought:finalize"],
  );
  assert.equal(confirmation.body.result.isError, true);
  assert.equal(
    confirmation.body.result.structuredContent.error?.code,
    "confirmation_required",
  );

  const idempotency = await callTool(
    baseUrl,
    "create_thought_draft",
    {
      thought_id: "thought-1",
      draft_text: "different",
      idempotency_key: "create-1",
      request_digest: DIGEST_B,
    },
    ["thought:write"],
  );
  assert.equal(
    idempotency.body.result.structuredContent.error?.code,
    "idempotency_conflict",
  );

  const conflict = await callTool(
    baseUrl,
    "finalize_thought",
    {
      thought_id: "thought-1",
      expected_revision: 0,
      final_text: "final",
      confirmation_token: "confirmed",
      idempotency_key: "final-1",
      request_digest: DIGEST_B,
    },
    ["thought:finalize"],
  );
  assert.equal(
    conflict.body.result.structuredContent.error.code,
    "revision_conflict",
  );
});

test("authentication and bounded request failures occur before tool execution", async (t) => {
  const { baseUrl } = await fixture(t, 128);
  const unauthorized = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    }),
  });
  assert.equal(unauthorized.status, 401);
  assert.equal((await unauthorized.json()).error.data.code, "unauthenticated");

  const oversized = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: headers(["audit:run"]),
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "audit_thought", arguments: { text: "x".repeat(300) } },
    }),
  });
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error.data.code, "payload_too_large");
});

test("a disconnected MCP request does not stop later requests", async (t) => {
  const { baseUrl } = await fixture(t);
  const controller = new AbortController();
  const pending = fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: headers(["audit:run"]),
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "audit_thought",
        arguments: { text: "x".repeat(100_000) },
      },
    }),
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  const listed = await rpc(baseUrl, "tools/list", {});
  assert.equal(listed.response.status, 200);
});
