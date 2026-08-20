import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadOAuthAccountRegistry } from "../../src/index.js";

const ISSUER = "https://cozy-bamboo-05-staging.authkit.app";

function document(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    accounts: [
      {
        issuer: ISSUER,
        external_subject_id: "workos-user-1",
        organization_id: "workos-org-1",
        subject_id: "llmthink-user-1",
        tenant_id: "tenant-1",
        workspace_id: "workspace-1",
        scopes: ["thought:read"],
        status: "active",
        mapping_revision: 1,
        ...overrides,
      },
    ],
  };
}

async function secureRegistry(root: string, value: unknown): Promise<string> {
  const path = join(root, "oauth-accounts.json");
  await writeFile(path, JSON.stringify(value), "utf8");
  await chmod(path, 0o600);
  return path;
}

test("OAuth account registry resolves only an exact active external identity", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "llmthink-oauth-registry-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const resolve = await loadOAuthAccountRegistry(
    await secureRegistry(root, document()),
  );
  assert.deepEqual(
    await resolve({
      issuer: ISSUER,
      subjectId: "workos-user-1",
      organizationId: "workos-org-1",
      tokenScopes: ["openid"],
    }),
    {
      subjectId: "llmthink-user-1",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      scopes: ["thought:read"],
    },
  );
  for (const identity of [
    { issuer: ISSUER, subjectId: "unknown", organizationId: "workos-org-1" },
    { issuer: ISSUER, subjectId: "workos-user-1" },
    {
      issuer: "https://other.authkit.app",
      subjectId: "workos-user-1",
      organizationId: "workos-org-1",
    },
  ]) {
    await assert.rejects(resolve({ ...identity, tokenScopes: ["openid"] }));
  }
});

test("OAuth account registry rejects unsafe files and ambiguous authorization", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "llmthink-oauth-registry-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const insecure = join(root, "insecure.json");
  await writeFile(insecure, JSON.stringify(document()), "utf8");
  await chmod(insecure, 0o644);
  await assert.rejects(loadOAuthAccountRegistry(insecure), /owner-only/);

  const target = await secureRegistry(root, document());
  const link = join(root, "registry-link.json");
  await symlink(target, link);
  await assert.rejects(loadOAuthAccountRegistry(link));

  await assert.rejects(
    loadOAuthAccountRegistry(
      await secureRegistry(root, {
        ...document(),
        accounts: [document().accounts[0], document().accounts[0]],
      }),
    ),
    /duplicate identity/,
  );

  const disabled = await loadOAuthAccountRegistry(
    await secureRegistry(root, document({ status: "disabled" })),
  );
  await assert.rejects(
    disabled({
      issuer: ISSUER,
      subjectId: "workos-user-1",
      organizationId: "workos-org-1",
      tokenScopes: ["openid"],
    }),
    /mapping is unavailable/,
  );
});
