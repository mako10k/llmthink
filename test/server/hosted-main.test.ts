import assert from "node:assert/strict";
import test from "node:test";

import { loadHostedMcpRuntimeConfig } from "../../src/server/hosted-main.js";

const BASE_ENV: NodeJS.ProcessEnv = {
  LLMTHINK_HOSTED_DATA_ROOT: "/var/lib/llmthink",
  LLMTHINK_HOSTED_BEARER_TOKEN: "x".repeat(32),
};

test("hosted runtime defaults to a loopback deployment with bounded identity", () => {
  const config = loadHostedMcpRuntimeConfig(BASE_ENV);
  assert.deepEqual(config, {
    hostname: "127.0.0.1",
    port: 3000,
    dataRoot: "/var/lib/llmthink",
    bearerToken: "x".repeat(32),
    subjectId: "deployment-user",
    tenantId: "deployment-tenant",
    workspaceId: "deployment-workspace",
    scopes: ["thought:read", "thought:write", "thought:finalize", "audit:run"],
  });
});

test("hosted runtime fails closed for incomplete or unsafe configuration", () => {
  for (const env of [
    {},
    { ...BASE_ENV, LLMTHINK_HOSTED_DATA_ROOT: "relative" },
    { ...BASE_ENV, LLMTHINK_HOSTED_BEARER_TOKEN: "short" },
    { ...BASE_ENV, LLMTHINK_HOSTED_PORT: "0" },
    { ...BASE_ENV, LLMTHINK_HOSTED_SCOPES: "admin" },
  ]) {
    assert.throws(() => loadHostedMcpRuntimeConfig(env));
  }
});
