import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCommandIdentity,
  assertHostedId,
  assertIdempotencyRetention,
  assertRevision,
  assertServerBindPolicy,
  assertThoughtRef,
  DEFAULT_IDEMPOTENCY_RETENTION_SECONDS,
  isExplicitLoopbackHostname,
  LLMTHINK_SERVER_ERROR_CODES,
  LLMTHINK_SERVER_FILE_SCHEMA_VERSION,
  LLMTHINK_SERVER_HTTP_STACK,
  LlmthinkServerError,
  MAX_IDEMPOTENCY_RETENTION_SECONDS,
  MIN_IDEMPOTENCY_RETENTION_SECONDS,
  type PureAuditResult,
  type RequestContext,
} from "../../src/index.js";

const CONTEXT: RequestContext = {
  subjectId: "user-1",
  tenantId: "tenant-1",
  workspaceId: "workspace-1",
  scopes: ["thought:read", "audit:run"],
  requestId: "request-1",
};

function expectServerError(
  run: () => void,
  code: LlmthinkServerError["code"],
): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof LlmthinkServerError);
    assert.equal(error.code, code);
    return true;
  });
}

test("server contract versions and stable error codes are explicit", () => {
  assert.equal(LLMTHINK_SERVER_FILE_SCHEMA_VERSION, 1);
  assert.deepEqual(LLMTHINK_SERVER_ERROR_CODES, [
    "invalid_argument",
    "unauthenticated",
    "forbidden",
    "not_found",
    "revision_conflict",
    "idempotency_conflict",
    "confirmation_required",
    "payload_too_large",
    "rate_limited",
    "storage_corrupt",
    "unsupported_schema_version",
    "internal",
  ]);
});

test("hosted IDs reject paths and unsafe identity syntax", () => {
  for (const value of ["../tenant", "/tenant", "tenant/name", "", "."]) {
    expectServerError(
      () => assertHostedId("tenantId", value),
      "invalid_argument",
    );
  }
  assert.doesNotThrow(() => assertHostedId("tenantId", "tenant_01-A"));
});

test("revision and idempotency contracts fail closed", () => {
  expectServerError(() => assertRevision(-1), "invalid_argument");
  expectServerError(() => assertRevision(1.5), "invalid_argument");
  assert.doesNotThrow(() => assertRevision(0));

  expectServerError(
    () =>
      assertCommandIdentity({
        idempotencyKey: "same-key",
        requestDigest: "sha256:ABC" as `sha256:${string}`,
      }),
    "invalid_argument",
  );
  assert.doesNotThrow(() =>
    assertCommandIdentity({
      idempotencyKey: "same-key",
      requestDigest: `sha256:${"a".repeat(64)}`,
    }),
  );
});

test("idempotency retention is bounded and defaults to 24 hours", () => {
  assert.equal(DEFAULT_IDEMPOTENCY_RETENTION_SECONDS, 86_400);
  assert.doesNotThrow(() =>
    assertIdempotencyRetention(DEFAULT_IDEMPOTENCY_RETENTION_SECONDS),
  );
  expectServerError(
    () => assertIdempotencyRetention(MIN_IDEMPOTENCY_RETENTION_SECONDS - 1),
    "invalid_argument",
  );
  expectServerError(
    () => assertIdempotencyRetention(MAX_IDEMPOTENCY_RETENTION_SECONDS + 1),
    "invalid_argument",
  );
});

test("thought references cannot cross authenticated tenant or workspace", () => {
  assert.doesNotThrow(() =>
    assertThoughtRef(
      {
        tenantId: "tenant-1",
        workspaceId: "workspace-1",
        thoughtId: "thought-1",
      },
      CONTEXT,
    ),
  );
  expectServerError(
    () =>
      assertThoughtRef(
        {
          tenantId: "tenant-2",
          workspaceId: "workspace-1",
          thoughtId: "thought-1",
        },
        CONTEXT,
      ),
    "forbidden",
  );
});

test("authentication-disabled binds require explicit loopback", () => {
  for (const hostname of [
    "localhost",
    "127.0.0.1",
    "127.2.3.4",
    "::1",
    "[::1]",
  ]) {
    assert.equal(isExplicitLoopbackHostname(hostname), true);
    assert.doesNotThrow(() =>
      assertServerBindPolicy({ hostname, authenticationEnabled: false }),
    );
  }
  for (const hostname of ["0.0.0.0", "::", "server.local", ""]) {
    assert.equal(isExplicitLoopbackHostname(hostname), false);
    expectServerError(
      () => assertServerBindPolicy({ hostname, authenticationEnabled: false }),
      "forbidden",
    );
    assert.doesNotThrow(() =>
      assertServerBindPolicy({ hostname, authenticationEnabled: true }),
    );
  }
});

test("initial HTTP stack uses Node HTTP and the SDK Streamable HTTP transport", () => {
  assert.deepEqual(LLMTHINK_SERVER_HTTP_STACK, {
    server: "node:http",
    mcpTransport:
      "@modelcontextprotocol/sdk/server/streamableHttp.js#StreamableHTTPServerTransport",
  });
});

test("pure audit result cannot carry a persisted success state", () => {
  const result: PureAuditResult = {
    persisted: false,
    report: {
      engine_version: "test",
      document_id: "document-1",
      generated_at: "2026-08-18T00:00:00.000Z",
      summary: {
        fatal_count: 0,
        error_count: 0,
        warning_count: 0,
        info_count: 0,
        hint_count: 0,
      },
      results: [],
      query_results: [],
    },
  };
  assert.equal(result.persisted, false);
});
