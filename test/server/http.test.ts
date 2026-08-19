import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createLlmthinkHttpServer,
  LlmthinkApplicationService,
  LlmthinkServerError,
  ServerFileThoughtRepository,
  type LlmthinkServerScope,
  type RequestContext,
} from "../../src/index.js";

const DIGESTS = {
  a: `sha256:${"a".repeat(64)}`,
  b: `sha256:${"b".repeat(64)}`,
  c: `sha256:${"c".repeat(64)}`,
  d: `sha256:${"d".repeat(64)}`,
  e: `sha256:${"e".repeat(64)}`,
} as const;

interface Fixture {
  readonly baseUrl: string;
  readonly close: () => Promise<void>;
}

async function fixture(
  t: test.TestContext,
  options: {
    ready?: boolean;
    requestLimitBytes?: number;
    responseLimitBytes?: number;
  } = {},
): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "llmthink-http-"));
  const repository = new ServerFileThoughtRepository({ dataRoot: root });
  const application = new LlmthinkApplicationService({ repository });
  const server = createLlmthinkHttpServer({
    application,
    requestLimitBytes: options.requestLimitBytes,
    responseLimitBytes: options.responseLimitBytes,
    isReady: () => options.ready ?? true,
    authenticate: async (request): Promise<RequestContext> => {
      if (request.headers.authorization !== "Bearer test") {
        throw new LlmthinkServerError(
          "unauthenticated",
          "Authentication required",
        );
      }
      const rawScopes = String(request.headers["x-scopes"] ?? "");
      return {
        subjectId: "user-1",
        tenantId: "tenant-1",
        workspaceId: "workspace-1",
        scopes: rawScopes.split(",").filter(Boolean) as LlmthinkServerScope[],
        requestId: String(request.headers["x-request-id"] ?? "request-1"),
      };
    },
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const close = async (): Promise<void> => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(root, { recursive: true, force: true });
  };
  t.after(close);
  return { baseUrl: `http://127.0.0.1:${port}`, close };
}

function headers(
  scopes: readonly LlmthinkServerScope[] = [],
): Record<string, string> {
  return {
    authorization: "Bearer test",
    "content-type": "application/json",
    "x-request-id": "request-1",
    "x-scopes": scopes.join(","),
  };
}

async function json(response: Response): Promise<unknown> {
  return response.json();
}

function field(value: unknown, ...path: Array<string | number>): unknown {
  let current = value;
  for (const key of path) {
    assert.ok(current !== null && typeof current === "object");
    current = (current as Record<string | number, unknown>)[key];
  }
  return current;
}

test("health and readiness use bounded JSON envelopes without authentication", async (t) => {
  const ready = await fixture(t);
  const healthResponse = await fetch(`${ready.baseUrl}/healthz`);
  assert.equal(healthResponse.status, 200);
  assert.equal(field(await json(healthResponse), "data", "status"), "ok");

  const notReady = await fixture(t, { ready: false });
  const readyResponse = await fetch(`${notReady.baseUrl}/readyz`);
  assert.equal(readyResponse.status, 503);
  assert.equal(field(await json(readyResponse), "data", "status"), "not_ready");
});

test("API routes require the injected authentication adapter", async (t) => {
  const { baseUrl } = await fixture(t);
  const response = await fetch(`${baseUrl}/api/v1/thoughts`);
  const body = await json(response);
  assert.equal(response.status, 401);
  assert.equal(field(body, "error", "code"), "unauthenticated");
  assert.equal(field(body, "request_id"), "unavailable");
});

test("pure audit returns the stable envelope and does not create a thought", async (t) => {
  const { baseUrl } = await fixture(t);
  const auditResponse = await fetch(`${baseUrl}/api/v1/audits`, {
    method: "POST",
    headers: headers(["audit:run"]),
    body: JSON.stringify({
      text: 'problem P1:\n  "question"',
      document_id: "doc-1",
    }),
  });
  const audit = await json(auditResponse);
  assert.equal(auditResponse.status, 200);
  assert.equal(field(audit, "request_id"), "request-1");
  assert.equal(field(audit, "data", "persisted"), false);
  assert.equal(field(audit, "data", "report", "document_id"), "doc-1");

  const listResponse = await fetch(`${baseUrl}/api/v1/thoughts`, {
    headers: headers(["thought:read"]),
  });
  assert.deepEqual(field(await json(listResponse), "data", "items"), []);
});

test("thought create, get, list, and search routes project stable JSON", async (t) => {
  const { baseUrl } = await fixture(t);
  const createResponse = await fetch(`${baseUrl}/api/v1/thoughts`, {
    method: "POST",
    headers: headers(["thought:write"]),
    body: JSON.stringify({
      thought_id: "thought-1",
      draft_text: "needle draft",
      idempotency_key: "create-1",
      request_digest: DIGESTS.a,
    }),
  });
  assert.equal(createResponse.status, 201);
  assert.equal(field(await json(createResponse), "data", "revision"), 1);

  const getResponse = await fetch(`${baseUrl}/api/v1/thoughts/thought-1`, {
    headers: headers(["thought:read"]),
  });
  const thought = await json(getResponse);
  assert.equal(field(thought, "data", "thought_id"), "thought-1");
  assert.equal(field(thought, "data", "draft_text"), "needle draft");

  const list = await json(
    await fetch(`${baseUrl}/api/v1/thoughts?limit=10`, {
      headers: headers(["thought:read"]),
    }),
  );
  assert.equal((field(list, "data", "items") as unknown[]).length, 1);

  const search = await json(
    await fetch(`${baseUrl}/api/v1/thoughts/search`, {
      method: "POST",
      headers: headers(["thought:read"]),
      body: JSON.stringify({
        query: "needle",
        limit: 10,
        include_reflections: false,
      }),
    }),
  );
  assert.equal(field(search, "data", "items", 0, "thought_id"), "thought-1");
});

test("revision and idempotency errors have fixed HTTP mappings", async (t) => {
  const { baseUrl } = await fixture(t);
  const create = {
    thought_id: "thought-1",
    draft_text: "draft",
    idempotency_key: "create-1",
    request_digest: DIGESTS.a,
  };
  const first = await fetch(`${baseUrl}/api/v1/thoughts`, {
    method: "POST",
    headers: headers(["thought:write"]),
    body: JSON.stringify(create),
  });
  assert.equal(first.status, 201);
  const replay = await fetch(`${baseUrl}/api/v1/thoughts`, {
    method: "POST",
    headers: headers(["thought:write"]),
    body: JSON.stringify(create),
  });
  assert.equal(field(await json(replay), "data", "revision"), 1);
  const conflict = await fetch(`${baseUrl}/api/v1/thoughts`, {
    method: "POST",
    headers: headers(["thought:write"]),
    body: JSON.stringify({ ...create, request_digest: DIGESTS.b }),
  });
  assert.equal(conflict.status, 409);
  assert.equal(
    field(await json(conflict), "error", "code"),
    "idempotency_conflict",
  );

  const stale = await fetch(`${baseUrl}/api/v1/thoughts/thought-1/draft`, {
    method: "PUT",
    headers: headers(["thought:write"]),
    body: JSON.stringify({
      draft_text: "stale",
      expected_revision: 0,
      idempotency_key: "save-1",
      request_digest: DIGESTS.c,
    }),
  });
  assert.equal(stale.status, 409);
  const staleBody = await json(stale);
  assert.equal(field(staleBody, "error", "code"), "revision_conflict");
  assert.equal(field(staleBody, "error", "details", "expected_revision"), 0);
  assert.equal(field(staleBody, "error", "details", "actual_revision"), 1);
});

test("mutation routes preserve audit, reflection, finalization, and event semantics", async (t) => {
  const { baseUrl } = await fixture(t);
  await fetch(`${baseUrl}/api/v1/thoughts`, {
    method: "POST",
    headers: headers(["thought:write"]),
    body: JSON.stringify({
      thought_id: "thought-1",
      draft_text: "draft",
      idempotency_key: "create-1",
      request_digest: DIGESTS.a,
    }),
  });
  const auditReport = {
    engine_version: "test",
    document_id: "thought-1",
    generated_at: "2026-08-19T00:00:00.000Z",
    summary: {
      fatal_count: 0,
      error_count: 0,
      warning_count: 0,
      info_count: 0,
      hint_count: 0,
    },
    results: [],
    query_results: [],
  };
  const audit = await fetch(`${baseUrl}/api/v1/thoughts/thought-1/audits`, {
    method: "POST",
    headers: headers(["thought:write", "audit:run"]),
    body: JSON.stringify({
      report: auditReport,
      expected_revision: 1,
      idempotency_key: "audit-1",
      request_digest: DIGESTS.b,
    }),
  });
  assert.equal(field(await json(audit), "data", "revision"), 2);
  const reflection = await fetch(
    `${baseUrl}/api/v1/thoughts/thought-1/reflections`,
    {
      method: "POST",
      headers: headers(["thought:write"]),
      body: JSON.stringify({
        kind: "decision",
        text: "retain boundary",
        expected_revision: 2,
        idempotency_key: "reflection-1",
        request_digest: DIGESTS.c,
      }),
    },
  );
  assert.equal(field(await json(reflection), "data", "revision"), 3);
  const finalized = await fetch(
    `${baseUrl}/api/v1/thoughts/thought-1/finalize`,
    {
      method: "POST",
      headers: headers(["thought:finalize"]),
      body: JSON.stringify({
        final_text: "final",
        confirmation_token: "confirmed",
        expected_revision: 3,
        idempotency_key: "final-1",
        request_digest: DIGESTS.d,
      }),
    },
  );
  assert.equal(field(await json(finalized), "data", "status"), "finalized");
  const events = await json(
    await fetch(`${baseUrl}/api/v1/thoughts/thought-1/events`, {
      headers: headers(["thought:read"]),
    }),
  );
  const eventItems = field(events, "data", "items") as unknown[];
  assert.deepEqual(
    eventItems.map((event) => field(event, "kind")),
    ["draft_saved", "audit_recorded", "reflect_recorded", "finalized"],
  );
});

test("invalid JSON, media type, and oversized requests fail before use cases", async (t) => {
  const { baseUrl } = await fixture(t, { requestLimitBytes: 80 });
  const invalid = await fetch(`${baseUrl}/api/v1/audits`, {
    method: "POST",
    headers: headers(["audit:run"]),
    body: "{",
  });
  assert.equal(field(await json(invalid), "error", "code"), "invalid_argument");
  const media = await fetch(`${baseUrl}/api/v1/audits`, {
    method: "POST",
    headers: { ...headers(["audit:run"]), "content-type": "text/plain" },
    body: "{}",
  });
  assert.equal(field(await json(media), "error", "code"), "invalid_argument");
  const large = await fetch(`${baseUrl}/api/v1/audits`, {
    method: "POST",
    headers: headers(["audit:run"]),
    body: JSON.stringify({ text: "x".repeat(100) }),
  });
  assert.equal(large.status, 413);
  assert.equal(field(await json(large), "error", "code"), "payload_too_large");
});

test("oversized responses fail closed and the server remains usable", async (t) => {
  const { baseUrl } = await fixture(t, { responseLimitBytes: 300 });
  const response = await fetch(`${baseUrl}/api/v1/audits`, {
    method: "POST",
    headers: headers(["audit:run"]),
    body: JSON.stringify({ text: 'problem P1:\n  "question"' }),
  });
  assert.equal(response.status, 413);
  assert.equal(
    field(await json(response), "error", "code"),
    "payload_too_large",
  );
  assert.equal((await fetch(`${baseUrl}/healthz`)).status, 200);
});

test("a disconnected request does not make the server unavailable", async (t) => {
  const { baseUrl } = await fixture(t);
  await new Promise<void>((resolve) => {
    const request = httpRequest(`${baseUrl}/api/v1/audits`, {
      method: "POST",
      headers: {
        ...headers(["audit:run"]),
        "content-length": "1000",
      },
    });
    request.on("error", () => resolve());
    request.on("close", () => resolve());
    request.write('{"text":"partial');
    request.destroy();
  });
  assert.equal((await fetch(`${baseUrl}/healthz`)).status, 200);
});
