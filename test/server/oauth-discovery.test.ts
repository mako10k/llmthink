import assert from "node:assert/strict";
import test from "node:test";

import {
  createLlmthinkOAuthDiscovery,
  oauthBearerChallenge,
  oauthProtectedResourceMetadata,
} from "../../src/index.js";

const OPTIONS = {
  resource: "https://llmthink.mk10.org/mcp",
  authorizationServers: ["https://example.authkit.app"],
  scopesSupported: ["thought:read", "thought:write"],
} as const;

test("OAuth discovery projects exact provider-neutral protected-resource metadata", () => {
  const discovery = createLlmthinkOAuthDiscovery(OPTIONS);
  assert.deepEqual(oauthProtectedResourceMetadata(discovery), {
    resource: "https://llmthink.mk10.org/mcp",
    authorization_servers: ["https://example.authkit.app"],
    scopes_supported: ["thought:read", "thought:write"],
    bearer_methods_supported: ["header"],
  });
  assert.equal(
    discovery.resourceMetadataUrl,
    "https://llmthink.mk10.org/.well-known/oauth-protected-resource",
  );
  assert.equal(
    oauthBearerChallenge(discovery),
    'Bearer resource_metadata="https://llmthink.mk10.org/.well-known/oauth-protected-resource", error="invalid_token", scope="thought:read thought:write"',
  );
});

test("OAuth discovery fails closed for unsafe, ambiguous, or incomplete configuration", () => {
  for (const options of [
    // eslint-disable-next-line sonarjs/no-clear-text-protocols -- negative security fixture
    { ...OPTIONS, resource: "http://llmthink.mk10.org/mcp" },
    { ...OPTIONS, resource: "https://llmthink.mk10.org/mcp/" },
    { ...OPTIONS, resource: "https://user@llmthink.mk10.org/mcp" },
    { ...OPTIONS, resource: "https://llmthink.mk10.org/mcp?tenant=other" },
    { ...OPTIONS, authorizationServers: [] },
    {
      ...OPTIONS,
      authorizationServers: [
        "https://example.authkit.app",
        "https://example.authkit.app",
      ],
    },
    // eslint-disable-next-line sonarjs/no-clear-text-protocols -- negative security fixture
    { ...OPTIONS, authorizationServers: ["http://example.authkit.app"] },
    { ...OPTIONS, scopesSupported: [] },
    { ...OPTIONS, scopesSupported: ["thought:read", "thought:read"] },
  ]) {
    assert.throws(() => createLlmthinkOAuthDiscovery(options as never));
  }
});
