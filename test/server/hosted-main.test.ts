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

test("hosted runtime enables provider-neutral OAuth discovery only with a complete pair", () => {
  const base = {
    LLMTHINK_HOSTED_DATA_ROOT: "/var/lib/llmthink",
    LLMTHINK_HOSTED_BEARER_TOKEN: "x".repeat(32),
  };
  const configured = loadHostedMcpRuntimeConfig({
    ...base,
    LLMTHINK_OAUTH_RESOURCE: "https://llmthink.mk10.org/mcp",
    LLMTHINK_OAUTH_AUTHORIZATION_SERVER: "https://example.authkit.app",
    LLMTHINK_OAUTH_JWKS_URI: "https://example.authkit.app/oauth2/jwks",
    LLMTHINK_OAUTH_ACCOUNT_REGISTRY_PATH: "/etc/llmthink/oauth-accounts.json",
  });
  assert.equal(
    configured.oauthDiscovery?.resource,
    "https://llmthink.mk10.org/mcp",
  );
  assert.deepEqual(configured.oauthDiscovery?.authorizationServers, [
    "https://example.authkit.app",
  ]);
  assert.deepEqual(configured.oauthDiscovery?.scopesSupported, [
    "openid",
    "email",
    "profile",
    "offline_access",
  ]);
  assert.equal(
    configured.oauthJwksUri,
    "https://example.authkit.app/oauth2/jwks",
  );
  assert.equal(
    configured.oauthAccountRegistryPath,
    "/etc/llmthink/oauth-accounts.json",
  );
  assert.throws(
    () =>
      loadHostedMcpRuntimeConfig({
        ...base,
        LLMTHINK_OAUTH_RESOURCE: "https://llmthink.mk10.org/mcp",
      }),
    /must be configured together/,
  );
});

test("hosted runtime enables lifecycle onboarding only as a complete OAuth-backed authority", () => {
  const oauth = {
    ...BASE_ENV,
    LLMTHINK_OAUTH_RESOURCE: "https://llmthink.mk10.org/mcp",
    LLMTHINK_OAUTH_AUTHORIZATION_SERVER: "https://example.authkit.app",
    LLMTHINK_OAUTH_JWKS_URI: "https://example.authkit.app/oauth2/jwks",
  };
  const lifecycle = {
    LLMTHINK_LIFECYCLE_DATABASE_PATH: "/var/lib/llmthink/lifecycle.sqlite",
    LLMTHINK_ONBOARDING_PUBLIC_ORIGIN: "https://llmthink.mk10.org",
    LLMTHINK_ONBOARDING_TERMS_ID: "trial-terms-ja-v1",
    LLMTHINK_ONBOARDING_PRIVACY_NOTICE_ID: "trial-privacy-ja-v2",
    LLMTHINK_ONBOARDING_SCOPE_POLICY_ID: "trial-default-v1",
  };
  assert.deepEqual(
    loadHostedMcpRuntimeConfig({ ...oauth, ...lifecycle }).lifecycle,
    {
      databasePath: "/var/lib/llmthink/lifecycle.sqlite",
      publicOrigin: "https://llmthink.mk10.org",
      termsId: "trial-terms-ja-v1",
      privacyNoticeId: "trial-privacy-ja-v2",
      scopePolicyId: "trial-default-v1",
    },
  );
  assert.throws(
    () => loadHostedMcpRuntimeConfig({ ...BASE_ENV, ...lifecycle }),
    /requires OAuth/,
  );
  assert.throws(
    () =>
      loadHostedMcpRuntimeConfig({
        ...oauth,
        ...lifecycle,
        LLMTHINK_OAUTH_ACCOUNT_REGISTRY_PATH: "/etc/llmthink/accounts.json",
      }),
    /cannot be enabled together/,
  );
  assert.throws(
    () =>
      loadHostedMcpRuntimeConfig({
        ...oauth,
        LLMTHINK_LIFECYCLE_DATABASE_PATH: "/var/lib/llmthink/lifecycle.sqlite",
      }),
    /must be complete/,
  );
});
