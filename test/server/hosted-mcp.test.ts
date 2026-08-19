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
      description: string;
      annotations: Record<string, boolean>;
      inputSchema: {
        properties?: Record<
          string,
          { type?: string; pattern?: string; description?: string }
        >;
      };
    }>;
    readonly isError?: boolean;
    readonly structuredContent: {
      readonly persisted?: boolean;
      readonly report?: { readonly document_id?: string };
      readonly items?: readonly unknown[];
      readonly revision?: number;
      readonly draft_text?: string;
      readonly error?: {
        readonly code: string;
        readonly navigation?: {
          readonly next_actions: readonly string[];
          readonly help: { readonly tool: string };
        };
      };
      readonly topic?: string;
      readonly storage_notice?: string;
      readonly tools?: Record<
        string,
        {
          readonly request_digest?: {
            readonly format: string;
            readonly pattern: string;
            readonly mutation_fields: readonly string[];
            readonly example: string;
          };
        }
      >;
    };
  };
  readonly error: {
    readonly message: string;
    readonly data: { readonly code: string };
  };
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

test("hosted MCP publishes help and eight goal-oriented tools with effect annotations", async (t) => {
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
    description: string;
    annotations: Record<string, boolean>;
  }>;
  assert.deepEqual(
    tools.map((tool) => tool.name),
    [
      "llmthink_help",
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
  assert.match(
    tools.find((tool) => tool.name === "create_thought_draft")?.description ??
      "",
    /externally persist/,
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

test("help mirrors CLI guidance and errors include actionable navigation", async (t) => {
  const { baseUrl } = await fixture(t);
  const help = await callTool(
    baseUrl,
    "llmthink_help",
    { topic: "overview" },
    [],
  );
  assert.equal(help.body.result.structuredContent.topic, "overview");
  assert.match(
    help.body.result.structuredContent.storage_notice ?? "",
    /external llmthink server/,
  );

  const denied = await callTool(baseUrl, "list_thoughts", { limit: 20 }, []);
  assert.equal(denied.body.result.structuredContent.error?.code, "forbidden");
  assert.equal(
    denied.body.result.structuredContent.error?.navigation?.help.tool,
    "llmthink_help",
  );
  assert.ok(
    (denied.body.result.structuredContent.error?.navigation?.next_actions
      .length ?? 0) > 0,
  );
});

test("write tools expose actionable request_digest contracts", async (t) => {
  const { baseUrl } = await fixture(t);
  const listed = await rpc(baseUrl, "tools/list", {});
  for (const name of [
    "create_thought_draft",
    "add_thought_reflection",
    "finalize_thought",
  ]) {
    const property = listed.body.result.tools.find((tool) => tool.name === name)
      ?.inputSchema.properties?.request_digest;
    assert.equal(property?.type, "string", name);
    assert.equal(property?.pattern, "^sha256:[a-f0-9]{64}$", name);
    assert.match(
      property?.description ?? "",
      /sha256:<64 lowercase hex>/,
      name,
    );
  }

  const help = await callTool(
    baseUrl,
    "llmthink_help",
    { topic: "tools", tool: "create_thought_draft" },
    [],
  );
  const digest =
    help.body.result.structuredContent.tools?.create_thought_draft
      ?.request_digest;
  assert.equal(digest?.format, "sha256:<64 lowercase hex>");
  assert.equal(digest?.pattern, "^sha256:[a-f0-9]{64}$");
  assert.deepEqual(digest?.mutation_fields, ["thought_id", "draft_text"]);
  assert.match(digest?.example ?? "", /^sha256:[a-f0-9]{64}$/);
});

test("request_digest validation explains malformed values consistently", async (t) => {
  const { baseUrl } = await fixture(t);
  for (const name of [
    "create_thought_draft",
    "add_thought_reflection",
    "finalize_thought",
  ]) {
    for (const request_digest of ["unprefixed", "sha256:xyz"]) {
      let args: Record<string, unknown> = {
        thought_id: "t",
        expected_revision: 0,
        final_text: "f",
      };
      if (name === "create_thought_draft") {
        args = { thought_id: "t", draft_text: "d" };
      } else if (name === "add_thought_reflection") {
        args = {
          thought_id: "t",
          expected_revision: 0,
          kind: "note",
          text: "n",
        };
      }
      const result = await callTool(
        baseUrl,
        name,
        {
          ...args,
          idempotency_key: "key",
          request_digest,
        },
        ["thought:write", "thought:finalize"],
      );
      assert.match(
        JSON.stringify(result.body),
        /expected sha256:<64 lowercase hex>/,
        `${name}: ${request_digest}`,
      );
    }
  }
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

test("authorization, schema, revision, and idempotency failures are structured", async (t) => {
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
  const finalized = await callTool(
    baseUrl,
    "finalize_thought",
    {
      thought_id: "thought-1",
      expected_revision: 1,
      final_text: "final",
      idempotency_key: "final-1",
      request_digest: DIGEST_B,
    },
    ["thought:finalize"],
  );
  assert.equal(finalized.body.result.structuredContent.revision, 2);

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
      expected_revision: 1,
      final_text: "final",
      idempotency_key: "final-2",
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
