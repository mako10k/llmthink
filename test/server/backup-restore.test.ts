import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  prepareBackupGeneration,
  type PreparedBackupGeneration,
} from "../../src/server/backup/generation.js";
import {
  RestoreValidationError,
  validateRestoredGeneration,
} from "../../src/server/backup/restore.js";
import { ServerFileThoughtRepository } from "../../src/server/file-repository.js";
import {
  SqliteLifecycleStore,
  TRIAL_AGREEMENT_ACTION_VERSION,
} from "../../src/server/sqlite-lifecycle-store.js";

const NOW = new Date("2026-08-21T05:00:00.000Z");

async function createGeneration(
  t: test.TestContext,
  orphan = false,
): Promise<{ generation: PreparedBackupGeneration; liveThoughtRoot: string }> {
  const root = await mkdtemp(join(tmpdir(), "llmthink-restore-validation-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const thoughtRoot = join(root, "thought-live");
  const generationRoot = join(root, "generations");
  await Promise.all([mkdir(thoughtRoot), mkdir(generationRoot)]);
  const store = new SqliteLifecycleStore({
    path: join(root, "lifecycle.sqlite"),
    now: () => NOW,
    entropy: (bytes) => Buffer.alloc(bytes, 7),
  });
  t.after(() => store.close());
  store.createTermsArtifact({
    termsId: "terms-trial-v1",
    kind: "trial_terms",
    version: "v1",
    locale: "ja-JP",
    effectiveAt: NOW.toISOString(),
    content: "terms",
    summary: "summary",
  });
  store.activateTerms("terms-trial-v1");
  store.createScopePolicy({
    scopePolicyId: "scope-trial-v1",
    version: 1,
    scopes: ["thought:read", "thought:write"],
  });
  const account = store.provisionTrialAccount({
    identity: {
      issuer: "https://issuer.example",
      subjectId: "subject-1",
      tokenScopes: ["openid"],
    },
    termsId: "terms-trial-v1",
    scopePolicyId: "scope-trial-v1",
    actionVersion: TRIAL_AGREEMENT_ACTION_VERSION,
  });
  store.markInitialWorkspaceRealized(account.tenantId, account.workspaceId);

  const tenantId = orphan ? "tenant-orphan" : account.tenantId;
  const workspaceId = orphan ? "workspace-orphan" : account.workspaceId;
  const repository = new ServerFileThoughtRepository({
    dataRoot: thoughtRoot,
    clock: () => NOW,
  });
  await repository.create(
    {
      thoughtId: "thought-1",
      draftText: "synthetic restore fixture",
      identity: {
        idempotencyKey: "restore-fixture",
        requestDigest: `sha256:${"a".repeat(64)}`,
      },
    },
    {
      subjectId: "subject-internal",
      tenantId,
      workspaceId,
      scopes: ["thought:read", "thought:write"],
      requestId: "request-1",
    },
  );

  const generation = await prepareBackupGeneration({
    lifecycleStore: store,
    thoughtDataRoot: thoughtRoot,
    generationRoot,
    producerVersion: "1.2.0",
    profileId: "trial-v1",
    now: () => NOW,
    createGenerationId: () => "generation_restore_0123456789",
    withWritesPaused: (action) => action(),
  });
  return { generation, liveThoughtRoot: thoughtRoot };
}

test("isolated restore validation accepts matching lifecycle and thought ownership", async (t) => {
  const { generation } = await createGeneration(t);
  const report = await validateRestoredGeneration({
    generationPath: generation.path,
    expectedGenerationId: generation.generationId,
    expectedSnapshotId: "b".repeat(64),
    now: () => NOW,
  });
  assert.equal(report.result, "valid");
  assert.equal(report.activation_authorized, false);
  assert.equal(report.catalog_pairs, 1);
  assert.equal(report.thought_pairs, 1);
  assert.equal(report.thoughts, 1);
  assert.deepEqual(Object.keys(report).sort(), [
    "activation_authorized",
    "catalog_pairs",
    "format",
    "generation_id",
    "lifecycle_schema_version",
    "result",
    "snapshot_id",
    "thought_pairs",
    "thoughts",
    "validated_at",
  ]);
});

test("restore validation rejects manifest alteration without touching live data", async (t) => {
  const { generation, liveThoughtRoot } = await createGeneration(t);
  const manifestPath = join(generation.path, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<
    string,
    unknown
  >;
  await writeFile(
    manifestPath,
    `${JSON.stringify({ ...manifest, email: "user@example.invalid" })}\n`,
  );
  await assert.rejects(
    validateRestoredGeneration({
      generationPath: generation.path,
      expectedGenerationId: generation.generationId,
      expectedSnapshotId: "b".repeat(64),
    }),
    { code: "manifest_mismatch" },
  );
  assert.equal(
    await readFile(
      join(
        liveThoughtRoot,
        "tenants",
        (await directoryAt(join(liveThoughtRoot, "tenants")))[0],
        "workspaces",
        await nestedWorkspace(liveThoughtRoot),
        "thoughts",
        "thought-1",
        "revisions",
        "0000000000000001",
        "draft.think",
      ),
      "utf8",
    ),
    "synthetic restore fixture",
  );
});

async function directoryAt(path: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  return readdir(path);
}

async function nestedWorkspace(root: string): Promise<string> {
  const tenant = (await directoryAt(join(root, "tenants")))[0];
  return (await directoryAt(join(root, "tenants", tenant, "workspaces")))[0];
}

test("restore validation rejects a self-consistent orphan thought hierarchy", async (t) => {
  const { generation } = await createGeneration(t, true);
  await assert.rejects(
    validateRestoredGeneration({
      generationPath: generation.path,
      expectedGenerationId: generation.generationId,
      expectedSnapshotId: "b".repeat(64),
    }),
    (error: unknown) =>
      error instanceof RestoreValidationError &&
      error.code === "ownership_mismatch",
  );
});

test("restore validation rejects component corruption and wrong generation identity", async (t) => {
  const { generation } = await createGeneration(t);
  await assert.rejects(
    validateRestoredGeneration({
      generationPath: generation.path,
      expectedGenerationId: "generation_wrong_0123456789",
      expectedSnapshotId: "b".repeat(64),
    }),
    { code: "manifest_mismatch" },
  );
  await writeFile(
    join(
      generation.path,
      "thought-data",
      "tenants",
      (await directoryAt(join(generation.path, "thought-data", "tenants")))[0],
      "workspaces",
      await nestedWorkspace(join(generation.path, "thought-data")),
      "thoughts",
      "thought-1",
      "revisions",
      "0000000000000001",
      "draft.think",
    ),
    "corrupted synthetic fixture",
  );
  await assert.rejects(
    validateRestoredGeneration({
      generationPath: generation.path,
      expectedGenerationId: generation.generationId,
      expectedSnapshotId: "b".repeat(64),
    }),
    { code: "component_mismatch" },
  );
});

test("restore validation rejects unexpected generation entries", async (t) => {
  const { generation } = await createGeneration(t);
  await writeFile(join(generation.path, "unexpected.txt"), "unexpected");
  await assert.rejects(
    validateRestoredGeneration({
      generationPath: generation.path,
      expectedGenerationId: generation.generationId,
      expectedSnapshotId: "b".repeat(64),
    }),
    { code: "unsafe_restore" },
  );
});
