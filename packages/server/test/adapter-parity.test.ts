import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createLlmthinkHostedMcpServer,
  createLlmthinkHttpServer,
  LlmthinkApplicationService,
  ServerFileThoughtRepository,
  type RequestContext,
} from "../src/index.js";

const REQUEST_DIGEST = `sha256:${"a".repeat(64)}` as const;
const CONTEXT: RequestContext = {
  subjectId: "user-1",
  tenantId: "tenant-1",
  workspaceId: "workspace-1",
  scopes: ["thought:read", "thought:write"],
  requestId: "parity-1",
};

async function listen(t: test.TestContext, server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function projection(value: Record<string, unknown>): Record<string, unknown> {
  return {
    thought_id: value.thought_id,
    revision: value.revision,
    status: value.status,
    draft_text: value.draft_text,
  };
}

test("direct Application Service, REST, and MCP preserve the same create transition", async (t) => {
  const roots = await Promise.all(
    ["direct", "rest", "mcp"].map((name) =>
      mkdtemp(join(tmpdir(), `llmthink-parity-${name}-`)),
    ),
  );
  t.after(async () =>
    Promise.all(
      roots.map((root) => rm(root, { recursive: true, force: true })),
    ),
  );
  const applications = roots.map(
    (dataRoot) =>
      new LlmthinkApplicationService({
        repository: new ServerFileThoughtRepository({ dataRoot }),
      }),
  );
  const command = {
    thoughtId: "thought-1",
    draftText: "same draft",
    identity: { idempotencyKey: "create-1", requestDigest: REQUEST_DIGEST },
  };

  const direct = await applications[0].createThought(command, CONTEXT);
  const expected = {
    thought_id: direct.record.id,
    revision: direct.revision,
    status: direct.record.status,
    draft_text: direct.draftText,
  };

  const restUrl = await listen(
    t,
    createLlmthinkHttpServer({
      application: applications[1],
      authenticate: async () => CONTEXT,
    }),
  );
  const restResponse = await fetch(`${restUrl}/api/v1/thoughts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      thought_id: command.thoughtId,
      draft_text: command.draftText,
      idempotency_key: command.identity.idempotencyKey,
      request_digest: command.identity.requestDigest,
    }),
  });
  const rest = (await restResponse.json()) as {
    data: Record<string, unknown>;
  };

  const mcpUrl = await listen(
    t,
    createLlmthinkHostedMcpServer({
      application: applications[2],
      authenticate: async () => CONTEXT,
    }),
  );
  const mcpResponse = await fetch(`${mcpUrl}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "create_thought_draft",
        arguments: {
          thought_id: command.thoughtId,
          draft_text: command.draftText,
          idempotency_key: command.identity.idempotencyKey,
          request_digest: command.identity.requestDigest,
        },
      },
    }),
  });
  const mcp = (await mcpResponse.json()) as {
    result: { structuredContent: Record<string, unknown> };
  };

  assert.equal(restResponse.status, 201);
  assert.equal(mcpResponse.status, 200);
  assert.deepEqual(projection(rest.data), expected);
  assert.deepEqual(projection(mcp.result.structuredContent), expected);
});
