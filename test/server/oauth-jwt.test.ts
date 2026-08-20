import assert from "node:assert/strict";
import test from "node:test";

import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTPayload,
} from "jose";

import {
  createLlmthinkJwtTokenVerifier,
  type LlmthinkExternalOAuthIdentity,
} from "../../src/index.js";

const ISSUER = "https://example.authkit.app";
const AUDIENCE = "https://llmthink.mk10.org/mcp";

async function fixture() {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  const identities: LlmthinkExternalOAuthIdentity[] = [];
  const verify = createLlmthinkJwtTokenVerifier({
    issuer: ISSUER,
    audience: AUDIENCE,
    jwks: createLocalJWKSet({
      keys: [{ ...jwk, kid: "current", alg: "RS256" }],
    }),
    algorithms: ["RS256"],
    allowedAuthorizedParties: ["chatgpt-client"],
    allowedTokenScopes: ["openid", "offline_access"],
    requiredTokenScopes: ["openid"],
    resolveAccount: async (identity) => {
      identities.push(identity);
      if (identity.subjectId !== "workos-user-1") {
        throw new Error("account mapping not found");
      }
      return {
        subjectId: "llmthink-subject-1",
        tenantId: "tenant-1",
        workspaceId: "workspace-1",
        scopes: ["thought:read"],
      };
    },
  });
  const sign = (
    claims: JWTPayload = {},
    registered: {
      issuer?: string;
      audience?: string;
      subject?: string;
      issuedAt?: number;
      expirationTime?: number | string;
      notBefore?: number;
    } = {},
  ) => {
    let token = new SignJWT({
      org_id: "workos-org-1",
      azp: "chatgpt-client",
      scope: "openid offline_access",
      ...claims,
    })
      .setProtectedHeader({ alg: "RS256", kid: "current" })
      .setIssuer(registered.issuer ?? ISSUER)
      .setAudience(registered.audience ?? AUDIENCE)
      .setSubject(registered.subject ?? "workos-user-1")
      .setIssuedAt(registered.issuedAt)
      .setExpirationTime(registered.expirationTime ?? "5m");
    if (registered.notBefore !== undefined) {
      token = token.setNotBefore(registered.notBefore);
    }
    return token.sign(privateKey);
  };
  return { verify, sign, identities };
}

test("JWT verification maps only bounded accepted identity claims through the server resolver", async () => {
  const { verify, sign, identities } = await fixture();
  const identity = await verify(
    await sign({
      email: "must-not-reach-llmthink@example.com",
      name: "Private",
    }),
  );
  assert.deepEqual(identity, {
    subjectId: "llmthink-subject-1",
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    scopes: ["thought:read"],
  });
  assert.deepEqual(identities, [
    {
      issuer: ISSUER,
      subjectId: "workos-user-1",
      organizationId: "workos-org-1",
      authorizedParty: "chatgpt-client",
      tokenScopes: ["openid", "offline_access"],
    },
  ]);
});

test("JWT verification rejects wrong trust, time, client, scope, signature, and account boundaries", async () => {
  const { verify, sign } = await fixture();
  for (const token of [
    await sign({}, { issuer: "https://attacker.example" }),
    await sign({}, { audience: "https://other.example/mcp" }),
    await sign({}, { expirationTime: Math.floor(Date.now() / 1000) - 60 }),
    await sign({}, { notBefore: Math.floor(Date.now() / 1000) + 60 }),
    await sign({ azp: "unknown-client" }),
    await sign({ scope: "offline_access" }),
    await sign({ scope: "openid admin" }),
    await sign({}, { subject: "unknown-user" }),
    "not-a-jwt",
  ]) {
    await assert.rejects(verify(token));
  }
});

test("JWT verifier configuration rejects symmetric algorithms and inconsistent scopes", async () => {
  const { publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  const base = {
    issuer: ISSUER,
    audience: AUDIENCE,
    jwks: createLocalJWKSet({ keys: [{ ...jwk, alg: "RS256" }] }),
    resolveAccount: async () => {
      throw new Error("unused");
    },
  };
  assert.throws(() =>
    createLlmthinkJwtTokenVerifier({ ...base, algorithms: ["HS256"] }),
  );
  assert.throws(() =>
    createLlmthinkJwtTokenVerifier({
      ...base,
      allowedTokenScopes: ["openid"],
      requiredTokenScopes: ["admin"],
    }),
  );
});
