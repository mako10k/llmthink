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
  SQLITE_LIFECYCLE_MIGRATION_0001_SHA256,
  SQLITE_LIFECYCLE_SCHEMA_VERSION,
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

test("recovery requires operator review, replaces the exact identity, and rotates the credential", async () => {
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
    const credential = account.recoveryCredential ?? "";
    const replacement = identity("workos-user-replacement");

    assert.throws(
      () => store.requestRecovery(`${credential}x`, replacement),
      /Recovery request is unavailable/,
    );
    const request = store.requestRecovery(credential, replacement);
    assert.equal(request.status, "pending_operator_review");
    assert.deepEqual(await store.accountResolver()(identity()), {
      subjectId: account.subjectId,
      tenantId: account.tenantId,
      workspaceId: account.workspaceId,
      scopes: ["audit:run", "thought:read"],
    });
    await assert.rejects(
      store.accountResolver()(replacement),
      /mapping is unavailable/,
    );

    const approved = store.approveRecovery(
      request.recoveryRequestId,
      "operator-ticket-1",
    );
    assert.equal(approved.mappingRevision, 2);
    assert.match(approved.recoveryCredential, /^llmthink-recovery-v1\./);
    assert.notEqual(approved.recoveryCredential, credential);
    await assert.rejects(
      store.accountResolver()(identity()),
      /mapping is unavailable/,
    );
    assert.equal(
      (await store.accountResolver()(replacement)).subjectId,
      account.subjectId,
    );
    assert.throws(
      () => store.requestRecovery(credential, identity("third-identity")),
      /Recovery request is unavailable/,
    );
    assert.throws(
      () =>
        store.approveRecovery(request.recoveryRequestId, "operator-ticket-1"),
      /Recovery approval is unavailable/,
    );
  } finally {
    store.close();
  }
});

test("archive receipts are metadata-only and closure follows the retention window", async () => {
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
    store.transitionAccount(identity(), "export_only", "service_wind_down");

    const digest = "ab".repeat(32);
    const receipt = store.recordArchive(identity(), {
      contentSha256: digest,
      byteLength: 2048,
      itemCount: 3,
    });
    assert.match(receipt.archiveReceiptId, /^archive-/);
    assert.deepEqual(
      { ...receipt, archiveReceiptId: "archive-redacted" },
      {
        archiveReceiptId: "archive-redacted",
        formatVersion: "llmthink-archive-v1",
        contentSha256: digest,
        byteLength: 2048,
        itemCount: 3,
        createdAt: NOW.toISOString(),
      },
    );
    store.transitionAccount(identity(), "closed", "archive_window_ended");
    assert.throws(
      () =>
        store.recordArchive(identity(), {
          contentSha256: digest,
          byteLength: 0,
          itemCount: 0,
        }),
      /Archive operation is unavailable/,
    );
  } finally {
    store.close();
  }
});

test("schema migration 0002 upgrades an exact migration 0001 database", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "llmthink-lifecycle-migrate-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "lifecycle.sqlite");
  new SqliteLifecycleStore({ path, now: () => NOW }).close();

  const legacy = new DatabaseSync(path);
  legacy.exec("DROP TABLE retention_transitions");
  legacy.exec("DROP TABLE archive_receipts");
  legacy.exec("DROP TABLE recovery_requests");
  legacy
    .prepare(
      "UPDATE schema_metadata SET schema_version = 1, migration_id = '0001-initial-lifecycle', migration_sha256 = ? WHERE singleton = 1",
    )
    .run(Buffer.from(SQLITE_LIFECYCLE_MIGRATION_0001_SHA256, "hex"));
  legacy.close();

  new SqliteLifecycleStore({ path, now: () => NOW }).close();
  const migrated = new DatabaseSync(path, { readOnly: true });
  try {
    const metadata = migrated
      .prepare("SELECT schema_version, migration_id FROM schema_metadata")
      .get() as { schema_version: number; migration_id: string };
    assert.deepEqual(
      { ...metadata },
      {
        schema_version: SQLITE_LIFECYCLE_SCHEMA_VERSION,
        migration_id: "0002-recovery-export",
      },
    );
    const tables = migrated
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('recovery_requests', 'archive_receipts', 'retention_transitions') ORDER BY name",
      )
      .all()
      .map((row) => (row as { name: string }).name);
    assert.deepEqual(tables, [
      "archive_receipts",
      "recovery_requests",
      "retention_transitions",
    ]);
  } finally {
    migrated.close();
  }
});
