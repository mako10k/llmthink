import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertVerifiedRequestContext,
  BoundedLlmthinkSecurityMetrics,
  createBearerTokenAuthenticator,
  createLlmthinkHostedMcpServer,
  createLlmthinkHttpServer,
  InMemoryLlmthinkRateLimiter,
  LlmthinkApplicationService,
  LlmthinkSecurityBoundary,
  LlmthinkServerError,
  ServerFileThoughtRepository,
  type LlmthinkSecurityObservation,
  type RequestContext,
} from "../../src/index.js";

const CONTEXT: RequestContext = {
  subjectId: "secret-subject",
  tenantId: "secret-tenant",
  workspaceId: "secret-workspace",
  scopes: ["thought:read"],
  requestId: "request-1",
};

function fakeRequest(authorization?: string): IncomingMessage {
  return { headers: { authorization } } as IncomingMessage;
}

function closeServer(server: Server): Promise<void> {
  return new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

test("bearer authentication derives hosted identity only from verified token claims", async () => {
  const seen: string[] = [];
  const authenticate = createBearerTokenAuthenticator({
    verify: async (token) => {
      seen.push(token);
      return {
        subjectId: "verified-user",
        tenantId: "verified-tenant",
        workspaceId: "verified-workspace",
        scopes: ["thought:read"],
      };
    },
    createRequestId: () => "generated-request",
  });
  const context = await authenticate(fakeRequest("Bearer opaque-secret"));
  assert.deepEqual(seen, ["opaque-secret"]);
  assert.deepEqual(context, {
    subjectId: "verified-user",
    tenantId: "verified-tenant",
    workspaceId: "verified-workspace",
    scopes: ["thought:read"],
    requestId: "generated-request",
  });
  await assert.rejects(
    authenticate(fakeRequest("Basic attacker")),
    (error: unknown) =>
      error instanceof LlmthinkServerError && error.code === "unauthenticated",
  );
});

test("verified contexts reject missing identity and unsupported scopes", () => {
  assert.throws(
    () =>
      assertVerifiedRequestContext({
        ...CONTEXT,
        tenantId: "",
      }),
    (error: unknown) =>
      error instanceof LlmthinkServerError && error.code === "unauthenticated",
  );
  assert.throws(
    () =>
      assertVerifiedRequestContext({
        ...CONTEXT,
        scopes: ["admin" as "thought:read"],
      }),
    (error: unknown) =>
      error instanceof LlmthinkServerError && error.code === "forbidden",
  );
});

test("rate limiting is bounded per verified tenant and subject", () => {
  const limiter = new InMemoryLlmthinkRateLimiter({
    limit: 1,
    windowMs: 100,
    maxSubjects: 1,
  });
  limiter.check(CONTEXT, 0);
  assert.throws(
    () => limiter.check(CONTEXT, 1),
    (error: unknown) =>
      error instanceof LlmthinkServerError && error.code === "rate_limited",
  );
  assert.doesNotThrow(() => limiter.check(CONTEXT, 100));
  assert.throws(
    () => limiter.check({ ...CONTEXT, subjectId: "second-subject" }, 101),
    (error: unknown) =>
      error instanceof LlmthinkServerError && error.code === "rate_limited",
  );
});

test("security observations are bounded and omit credentials and content", async () => {
  const observations: LlmthinkSecurityObservation[] = [];
  let now = 10;
  const boundary = new LlmthinkSecurityBoundary({
    authenticate: async () => CONTEXT,
    observe: (observation) => observations.push(observation),
    now: () => now,
  });
  const context = await boundary.authenticate(
    fakeRequest("Bearer token-secret"),
  );
  now = 17;
  await boundary.execute(context, "rest", "POST audits", async () => "ok");
  assert.equal(observations.length, 1);
  assert.equal(observations[0].latency_ms, 0);
  assert.equal(observations[0].operation, "POST audits");
  const serialized = JSON.stringify(observations);
  for (const secret of [
    "token-secret",
    "secret-subject",
    "secret-tenant",
    "secret-workspace",
    "thought body",
  ]) {
    assert.equal(serialized.includes(secret), false);
  }
});

test("metrics aggregate bounded non-identity dimensions", () => {
  const metrics = new BoundedLlmthinkSecurityMetrics(1);
  const base: LlmthinkSecurityObservation = {
    request_id: "request-1",
    subject: "pseudonym-1",
    tenant: "pseudonym-2",
    workspace: "pseudonym-3",
    transport: "rest",
    operation: "GET thoughts",
    outcome: "success",
    code: "ok",
    latency_ms: 3,
  };
  metrics.observe(base);
  metrics.observe({ ...base, request_id: "request-2", latency_ms: 5 });
  metrics.observe({ ...base, operation: "attacker/value", latency_ms: 100 });
  assert.deepEqual(metrics.snapshot(), [
    {
      transport: "rest",
      operation: "GET thoughts",
      outcome: "success",
      code: "ok",
      count: 2,
      latency_ms_total: 8,
      latency_ms_max: 5,
    },
  ]);
  assert.equal(JSON.stringify(metrics.snapshot()).includes("pseudonym"), false);
});

test("authentication and execution timeouts fail closed and are observed", async () => {
  const observations: LlmthinkSecurityObservation[] = [];
  const boundary = new LlmthinkSecurityBoundary({
    authenticate: async () => CONTEXT,
    timeoutMs: 5,
    observe: (observation) => observations.push(observation),
  });
  await assert.rejects(
    boundary.execute(
      CONTEXT,
      "rest",
      "GET thoughts",
      () => new Promise<never>(() => undefined),
    ),
    (error: unknown) =>
      error instanceof LlmthinkServerError && error.code === "internal",
  );
  assert.equal(observations[0].outcome, "error");
  assert.equal(observations[0].code, "internal");

  const stalledAuthentication = new LlmthinkSecurityBoundary({
    authenticate: () => new Promise<RequestContext>(() => undefined),
    timeoutMs: 5,
  });
  await assert.rejects(
    stalledAuthentication.authenticate(fakeRequest()),
    (error: unknown) =>
      error instanceof LlmthinkServerError && error.code === "internal",
  );
});

test("REST and MCP can share one verified rate boundary", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "llmthink-security-"));
  const application = new LlmthinkApplicationService({
    repository: new ServerFileThoughtRepository({ dataRoot: root }),
  });
  const boundary = new LlmthinkSecurityBoundary({
    authenticate: async () => CONTEXT,
    rateLimiter: new InMemoryLlmthinkRateLimiter({ limit: 1 }),
  });
  const rest = createLlmthinkHttpServer({
    application,
    authenticate: async () => CONTEXT,
    security: boundary,
  });
  const mcp = createLlmthinkHostedMcpServer({
    application,
    authenticate: async () => CONTEXT,
    security: boundary,
  });
  await Promise.all([
    new Promise<void>((resolve) => rest.listen(0, "127.0.0.1", resolve)),
    new Promise<void>((resolve) => mcp.listen(0, "127.0.0.1", resolve)),
  ]);
  t.after(async () => {
    await Promise.all([rest, mcp].map(closeServer));
    await rm(root, { recursive: true, force: true });
  });
  const restPort = (rest.address() as AddressInfo).port;
  const mcpPort = (mcp.address() as AddressInfo).port;
  const restResponse = await fetch(
    `http://127.0.0.1:${restPort}/api/v1/thoughts`,
  );
  assert.equal(restResponse.status, 200);
  const mcpResponse = await fetch(`http://127.0.0.1:${mcpPort}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    }),
  });
  assert.equal(mcpResponse.status, 429);
  const body = (await mcpResponse.json()) as {
    error: { data: { code: string } };
  };
  assert.equal(body.error.data.code, "rate_limited");
});
