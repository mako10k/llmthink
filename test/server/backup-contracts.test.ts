import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  BackupContractError,
  encodeBackupGenerationManifest,
  parseBackupGenerationManifest,
  parseBackupReceipt,
} from "../../src/server/backup/contracts.js";
import {
  resolveAbsentBackupDestination,
  resolveExistingBackupSource,
} from "../../src/server/backup/path-policy.js";

const DIGEST = `sha256:${"a".repeat(64)}`;
const GENERATION_ID = "generation_0123456789abcdef";

function manifest(): Record<string, unknown> {
  return {
    format: "llmthink-backup-generation-v1",
    generation_id: GENERATION_ID,
    created_at: "2026-08-21T02:00:00.000Z",
    recovery_point_at: "2026-08-21T01:59:59.000Z",
    producer_version: "1.2.0",
    profile_id: "trial-v1",
    components: [
      {
        kind: "thought_repository",
        name: "thought-data",
        format_version: 1,
        byte_size: 2,
        sha256: DIGEST,
      },
      {
        kind: "lifecycle_sqlite",
        name: "lifecycle.sqlite",
        format_version: 1,
        byte_size: 1,
        sha256: DIGEST,
      },
    ],
  };
}

function expectCode(
  run: () => unknown,
  code: BackupContractError["code"],
): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof BackupContractError);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    return true;
  });
}

test("backup manifest is strict, complete, and canonically ordered", () => {
  const value = manifest();
  assert.equal(parseBackupGenerationManifest(value).components.length, 2);
  const encoded = encodeBackupGenerationManifest(value);
  assert.ok(encoded.endsWith("\n"));
  assert.ok(
    encoded.indexOf("lifecycle_sqlite") < encoded.indexOf("thought_repository"),
  );
  expectCode(
    () =>
      parseBackupGenerationManifest({ ...value, email: "user@example.test" }),
    "invalid_manifest",
  );
  expectCode(
    () =>
      parseBackupGenerationManifest({
        ...value,
        components: [
          (value.components as unknown[])[0],
          (value.components as unknown[])[0],
        ],
      }),
    "invalid_manifest",
  );
  expectCode(
    () =>
      parseBackupGenerationManifest({
        ...value,
        recovery_point_at: "2026-08-22T00:00:00.000Z",
      }),
    "invalid_manifest",
  );
});

test("backup receipt rejects unknown, identifying, and malformed fields", () => {
  const receipt = {
    format: "llmthink-backup-receipt-v1",
    generation_id: GENERATION_ID,
    manifest_sha256: DIGEST,
    snapshot_id: "b".repeat(64),
    repository_format: 2,
    restic_version: "0.18.0",
    profile_id: "trial-v1",
    tags: ["llmthink-v1"],
    files_new: 3,
    bytes_added: 100,
    snapshot_observed_at: "2026-08-21T02:01:00.000Z",
    check_state: "not_checked",
  };
  assert.equal(parseBackupReceipt(receipt).snapshot_id, "b".repeat(64));
  expectCode(
    () => parseBackupReceipt({ ...receipt, hostname: "private-host" }),
    "invalid_receipt",
  );
  expectCode(
    () => parseBackupReceipt({ ...receipt, snapshot_id: "latest" }),
    "invalid_receipt",
  );
});

test("backup path policy accepts only regular sources below a real root", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "llmthink-backup-source-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "safe"));
  await writeFile(join(root, "safe", "source.bin"), "fixture");
  assert.equal(
    await resolveExistingBackupSource(root, "safe/source.bin"),
    join(root, "safe", "source.bin"),
  );
  await symlink(join(root, "safe", "source.bin"), join(root, "linked"));
  await assert.rejects(resolveExistingBackupSource(root, "linked"), {
    code: "unsafe_path",
  });
  await assert.rejects(resolveExistingBackupSource(root, "../escape"), {
    code: "unsafe_path",
  });
  await assert.rejects(resolveExistingBackupSource(root, "safe"), {
    code: "unsafe_path",
  });
});

test("backup destination must be absent below validated directories", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "llmthink-backup-destination-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "generations"));
  assert.equal(
    await resolveAbsentBackupDestination(root, "generations/new-generation"),
    join(root, "generations", "new-generation"),
  );
  await mkdir(join(root, "generations", "existing"));
  await assert.rejects(
    resolveAbsentBackupDestination(root, "generations/existing"),
    { code: "unsafe_path" },
  );
  await symlink(join(root, "generations"), join(root, "linked-generations"));
  await assert.rejects(
    resolveAbsentBackupDestination(root, "linked-generations/new"),
    { code: "unsafe_path" },
  );
});
