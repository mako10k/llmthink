import assert from "node:assert/strict";
import {
  chmod,
  lstat,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  SqliteLifecycleStore,
  TRIAL_AGREEMENT_ACTION_VERSION,
} from "../../src/server/sqlite-lifecycle-store.js";

const ISSUER = "https://cozy-bamboo-05-staging.authkit.app";
const NOW = new Date("2026-08-20T10:00:00.000Z");

function identity(subjectId = "workos-user-1", organizationId?: string) {
  return {
    issuer: ISSUER,
    subjectId,
    ...(organizationId === undefined ? {} : { organizationId }),
    tokenScopes: ["openid"],
  };
}

function prepare(store: SqliteLifecycleStore): void {
  store.createTermsArtifact({
    termsId: "terms-trial-v1",
    kind: "trial_terms",
    version: "2026-08-20-v1",
    locale: "ja-JP",
    effectiveAt: NOW.toISOString(),
    content: "# Trial terms\n\nTest service.",
    summary: "Trial service; terms may change.",
  });
  store.activateTerms("terms-trial-v1");
  store.createScopePolicy({
    scopePolicyId: "scope-trial-v1",
    version: 1,
    scopes: ["thought:read", "audit:run"],
  });
}

test("SQLite lifecycle provisioning is exact, idempotent, and fail closed until realization", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "llmthink-lifecycle-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new SqliteLifecycleStore({
    path: join(root, "lifecycle.sqlite"),
    now: () => NOW,
  });
  t.after(() => store.close());
  prepare(store);

  const first = store.provisionTrialAccount({
    identity: identity(),
    termsId: "terms-trial-v1",
    scopePolicyId: "scope-trial-v1",
    actionVersion: TRIAL_AGREEMENT_ACTION_VERSION,
  });
  assert.equal(first.status, "provisioned");
  assert.match(first.recoveryCredential ?? "", /^llmthink-recovery-v1\./);

  const replay = store.provisionTrialAccount({
    identity: identity(),
    termsId: "terms-trial-v1",
    scopePolicyId: "scope-trial-v1",
    actionVersion: TRIAL_AGREEMENT_ACTION_VERSION,
  });
  assert.deepEqual(replay, {
    status: "already_provisioned",
    subjectId: first.subjectId,
    tenantId: first.tenantId,
    workspaceId: first.workspaceId,
    receiptId: first.receiptId,
    provisioningOperationId: first.provisioningOperationId,
  });
  assert.equal(replay.recoveryCredential, undefined);
  assert.deepEqual(store.counts(), {
    accounts: 1,
    external_identity_mappings: 1,
    agreement_receipts: 1,
    tenant_catalog: 1,
    workspace_catalog: 1,
    recovery_credentials: 1,
    provisioning_operations: 1,
    realization_outbox: 1,
  });

  const resolve = store.accountResolver();
  await assert.rejects(resolve(identity()), /mapping is unavailable/);
  store.markInitialWorkspaceRealized(first.tenantId, first.workspaceId);
  assert.deepEqual(await resolve(identity()), {
    subjectId: first.subjectId,
    tenantId: first.tenantId,
    workspaceId: first.workspaceId,
    scopes: ["audit:run", "thought:read"],
  });
  await assert.rejects(resolve(identity("unknown")), /mapping is unavailable/);
  await assert.rejects(
    resolve(identity("workos-user-1", "org-1")),
    /mapping is unavailable/,
  );
});

test("SQLite lifecycle keeps absent and present organization identities separate", () => {
  const store = new SqliteLifecycleStore({
    path: ":memory:",
    allowMemory: true,
    now: () => NOW,
  });
  try {
    prepare(store);
    const personal = store.provisionTrialAccount({
      identity: identity("same-subject"),
      termsId: "terms-trial-v1",
      scopePolicyId: "scope-trial-v1",
      actionVersion: TRIAL_AGREEMENT_ACTION_VERSION,
    });
    const organization = store.provisionTrialAccount({
      identity: identity("same-subject", "org-1"),
      termsId: "terms-trial-v1",
      scopePolicyId: "scope-trial-v1",
      actionVersion: TRIAL_AGREEMENT_ACTION_VERSION,
    });
    assert.notEqual(personal.subjectId, organization.subjectId);
    assert.notEqual(personal.tenantId, organization.tenantId);
    assert.equal(store.counts().accounts, 2);
  } finally {
    store.close();
  }
});

test("SQLite lifecycle rejects stale terms, invalid scopes, and unsafe paths", () => {
  assert.throws(
    () => new SqliteLifecycleStore({ path: "relative.sqlite" }),
    /absolute/,
  );
  assert.throws(
    () => new SqliteLifecycleStore({ path: ":memory:" }),
    /test-only/,
  );
  const store = new SqliteLifecycleStore({
    path: ":memory:",
    allowMemory: true,
  });
  try {
    assert.throws(
      () =>
        store.createScopePolicy({
          scopePolicyId: "scope-invalid",
          version: 1,
          scopes: ["owner:all" as "thought:read"],
        }),
      /invalid scopes/,
    );
    store.createTermsArtifact({
      termsId: "terms-draft",
      kind: "trial_terms",
      version: "draft-v1",
      locale: "ja-JP",
      effectiveAt: NOW.toISOString(),
      content: "draft",
      summary: "draft",
    });
    store.createScopePolicy({
      scopePolicyId: "scope-trial-v1",
      version: 1,
      scopes: ["thought:read"],
    });
    assert.throws(
      () =>
        store.provisionTrialAccount({
          identity: identity(),
          termsId: "terms-draft",
          scopePolicyId: "scope-trial-v1",
          actionVersion: TRIAL_AGREEMENT_ACTION_VERSION,
        }),
      /Terms artifact changed/,
    );
    assert.equal(store.counts().accounts, 0);
  } finally {
    store.close();
  }
});

test("SQLite lifecycle creates a protected file and rejects insecure files and symlinks", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "llmthink-lifecycle-path-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const protectedPath = join(root, "protected.sqlite");
  const store = new SqliteLifecycleStore({ path: protectedPath });
  store.close();
  assert.equal((await lstat(protectedPath)).mode & 0o777, 0o600);
  new SqliteLifecycleStore({ path: protectedPath }).close();

  const tamper = new DatabaseSync(protectedPath);
  tamper
    .prepare("UPDATE schema_metadata SET migration_sha256 = zeroblob(32)")
    .run();
  tamper.close();
  assert.throws(
    () => new SqliteLifecycleStore({ path: protectedPath }),
    /schema is unsupported/,
  );

  const insecurePath = join(root, "insecure.sqlite");
  await writeFile(insecurePath, "");
  await chmod(insecurePath, 0o644);
  assert.throws(
    () => new SqliteLifecycleStore({ path: insecurePath }),
    /owner-only/,
  );

  const linkPath = join(root, "link.sqlite");
  await symlink(protectedPath, linkPath);
  assert.throws(
    () => new SqliteLifecycleStore({ path: linkPath }),
    /non-symlink/,
  );
});

test("activating material terms requires exact re-consent before access resumes", async () => {
  const store = new SqliteLifecycleStore({
    path: ":memory:",
    allowMemory: true,
    now: () => NOW,
  });
  try {
    prepare(store);
    const account = store.provisionTrialAccount({
      identity: identity(),
      termsId: "terms-trial-v1",
      scopePolicyId: "scope-trial-v1",
      actionVersion: TRIAL_AGREEMENT_ACTION_VERSION,
    });
    store.markInitialWorkspaceRealized(account.tenantId, account.workspaceId);
    const resolve = store.accountResolver();
    await resolve(identity());

    store.createTermsArtifact({
      termsId: "terms-trial-v2",
      kind: "trial_terms",
      version: "2026-09-01-v2",
      locale: "ja-JP",
      effectiveAt: "2026-09-01T00:00:00.000Z",
      content: "# Changed trial terms",
      summary: "Materially changed trial terms.",
    });
    store.activateTerms("terms-trial-v2");
    await assert.rejects(resolve(identity()), /mapping is unavailable/);
    assert.throws(
      () =>
        store.recordReconsent(
          identity(),
          "terms-trial-v1",
          TRIAL_AGREEMENT_ACTION_VERSION,
        ),
      /re-consent is unavailable/,
    );

    const receiptId = store.recordReconsent(
      identity(),
      "terms-trial-v2",
      TRIAL_AGREEMENT_ACTION_VERSION,
    );
    assert.match(receiptId, /^receipt-/);
    await resolve(identity());
    assert.throws(
      () =>
        store.recordReconsent(
          identity(),
          "terms-trial-v2",
          TRIAL_AGREEMENT_ACTION_VERSION,
        ),
      /re-consent is unavailable/,
    );
  } finally {
    store.close();
  }
});

test("operator lifecycle transitions fail closed and cannot skip export-only", async () => {
  const store = new SqliteLifecycleStore({
    path: ":memory:",
    allowMemory: true,
    now: () => NOW,
  });
  try {
    prepare(store);
    const account = store.provisionTrialAccount({
      identity: identity(),
      termsId: "terms-trial-v1",
      scopePolicyId: "scope-trial-v1",
      actionVersion: TRIAL_AGREEMENT_ACTION_VERSION,
    });
    store.markInitialWorkspaceRealized(account.tenantId, account.workspaceId);
    const resolve = store.accountResolver();
    await resolve(identity());

    assert.throws(
      () => store.transitionAccount(identity(), "closed", "operator_close"),
      /transition is unavailable/,
    );
    assert.equal(
      store.transitionAccount(identity(), "suspended", "security_review"),
      "suspended",
    );
    await assert.rejects(resolve(identity()), /mapping is unavailable/);
    assert.equal(
      store.transitionAccount(identity(), "export_only", "service_wind_down"),
      "export_only",
    );
    assert.equal(
      store.transitionAccount(identity(), "closed", "archive_window_ended"),
      "closed",
    );
    assert.throws(
      () => store.transitionAccount(identity(), "suspended", "invalid_reopen"),
      /transition is unavailable/,
    );
  } finally {
    store.close();
  }
});
