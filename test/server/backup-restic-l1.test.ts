import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import {
  backupGenerationWithRestic,
  restoreSnapshotWithRestic,
} from "../../src/server/backup/restic.js";

const execute = promisify(execFile);
const binary = process.env.LLMTHINK_TEST_RESTIC_BINARY;

test(
  "L1 real restic repository supports exact backup, check, restore, forget, and prune",
  { skip: binary === undefined },
  async (t) => {
    assert.ok(binary);
    const root = await mkdtemp(join(tmpdir(), "llmthink-restic-real-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const repository = join(root, "repository");
    const generation = join(root, "generation_0123456789abcdef");
    const cache = join(root, "cache");
    const passwordFile = join(root, "password");
    await Promise.all([mkdir(repository), mkdir(generation), mkdir(cache)]);
    await writeFile(passwordFile, `${randomBytes(32).toString("hex")}\n`, {
      mode: 0o600,
    });
    await chmod(passwordFile, 0o600);
    await writeFile(join(generation, "manifest.json"), "synthetic fixture\n", {
      mode: 0o600,
    });
    const env = {
      RESTIC_REPOSITORY: repository,
      RESTIC_PASSWORD_FILE: passwordFile,
      RESTIC_CACHE_DIR: cache,
      RESTIC_HOST: "llmthink-trial-v1",
    };
    await execute(binary, ["init", "--repository-version", "2"], { env });

    const receipt = await backupGenerationWithRestic({
      executable: binary,
      expectedVersion: "0.19.1",
      repository,
      passwordFile,
      cacheDirectory: cache,
      generationPath: generation,
      generationId: "generation_0123456789abcdef",
      manifestSha256: `sha256:${"a".repeat(64)}`,
      profileId: "llmthink-trial-v1",
    });
    await execute(binary, ["check", "--read-data"], { env });

    const restoreRoot = join(root, "restore");
    const restoredGeneration = await restoreSnapshotWithRestic({
      executable: binary,
      expectedVersion: "0.19.1",
      repository,
      passwordFile,
      cacheDirectory: cache,
      snapshotId: receipt.snapshot_id,
      originalGenerationPath: generation,
      restoreRoot,
      profileId: "llmthink-trial-v1",
    });
    const restored = join(restoredGeneration, "manifest.json");
    assert.equal(await readFile(restored, "utf8"), "synthetic fixture\n");

    await execute(binary, ["forget", receipt.snapshot_id], { env });
    await execute(binary, ["prune"], { env });
    const snapshots = await execute(binary, ["snapshots", "--json"], { env });
    assert.deepEqual(JSON.parse(snapshots.stdout), []);
    await assert.rejects(access(join(repository, "does-not-exist")), {
      code: "ENOENT",
    });
  },
);
