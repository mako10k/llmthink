import assert from "node:assert/strict";
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { prepareBackupGeneration } from "../../src/server/backup/generation.js";
import { parseBackupGenerationManifest } from "../../src/server/backup/contracts.js";
import { SqliteLifecycleStore } from "../../src/server/sqlite-lifecycle-store.js";

async function fixture(t: test.TestContext): Promise<{
  root: string;
  database: string;
  thoughts: string;
  generations: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "llmthink-backup-generation-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const thoughts = join(root, "thought-source");
  const generations = join(root, "generations");
  await mkdir(join(thoughts, "tenants", "opaque", "revisions"), {
    recursive: true,
  });
  await mkdir(generations);
  await writeFile(
    join(thoughts, "tenants", "opaque", "revisions", "record.json"),
    "fixture\n",
  );
  return {
    root,
    database: join(root, "lifecycle.sqlite"),
    thoughts,
    generations,
  };
}

test("lifecycle online backup includes committed WAL state and is owner-only", async (t) => {
  const paths = await fixture(t);
  const store = new SqliteLifecycleStore({ path: paths.database });
  t.after(() => store.close());
  const writer = new DatabaseSync(paths.database);
  t.after(() => writer.close());
  writer.exec(
    "PRAGMA journal_mode = WAL; CREATE TABLE backup_marker(value TEXT NOT NULL); INSERT INTO backup_marker VALUES ('committed');",
  );

  const destination = join(paths.root, "online-copy.sqlite");
  await store.backupTo(destination);
  assert.equal((await lstat(destination)).mode & 0o777, 0o600);
  const restored = new DatabaseSync(destination, { readOnly: true });
  try {
    const marker = restored.prepare("SELECT value FROM backup_marker").get();
    assert.equal(marker?.value, "committed");
  } finally {
    restored.close();
  }
});

test("generation is produced only inside the explicit pause boundary", async (t) => {
  const paths = await fixture(t);
  const store = new SqliteLifecycleStore({ path: paths.database });
  t.after(() => store.close());
  let paused = false;
  const generation = await prepareBackupGeneration({
    lifecycleStore: store,
    thoughtDataRoot: paths.thoughts,
    generationRoot: paths.generations,
    producerVersion: "1.2.0",
    profileId: "trial-v1",
    now: () => new Date("2026-08-21T03:00:00.000Z"),
    createGenerationId: () => "generation_0123456789abcdef",
    withWritesPaused: async (action) => {
      assert.equal(paused, false);
      paused = true;
      try {
        return await action();
      } finally {
        paused = false;
      }
    },
  });
  assert.equal(paused, false);
  assert.equal((await lstat(generation.path)).mode & 0o777, 0o700);
  assert.equal(
    (await lstat(join(generation.path, "manifest.json"))).mode & 0o777,
    0o600,
  );
  const manifest = parseBackupGenerationManifest(
    JSON.parse(await readFile(join(generation.path, "manifest.json"), "utf8")),
  );
  assert.equal(manifest.generation_id, generation.generationId);
  assert.deepEqual(manifest.components.map(({ kind }) => kind).sort(), [
    "lifecycle_sqlite",
    "thought_repository",
  ]);
  assert.equal(
    await readFile(
      join(
        generation.path,
        "thought-data",
        "tenants",
        "opaque",
        "revisions",
        "record.json",
      ),
      "utf8",
    ),
    "fixture\n",
  );
});

test("unsafe thought entries fail closed and remove the partial generation", async (t) => {
  const paths = await fixture(t);
  const store = new SqliteLifecycleStore({ path: paths.database });
  t.after(() => store.close());
  await symlink(
    join(paths.root, "outside"),
    join(paths.thoughts, "unsafe-link"),
  );
  await assert.rejects(
    prepareBackupGeneration({
      lifecycleStore: store,
      thoughtDataRoot: paths.thoughts,
      generationRoot: paths.generations,
      producerVersion: "1.2.0",
      profileId: "trial-v1",
      createGenerationId: () => "generation_unsafe_0123456789",
      withWritesPaused: (action) => action(),
    }),
    /unsafe/,
  );
  await assert.rejects(
    access(join(paths.generations, "generation_unsafe_0123456789")),
    { code: "ENOENT" },
  );
});

test("generation rejects overlapping source and destination roots", async (t) => {
  const paths = await fixture(t);
  const nestedGenerations = join(paths.thoughts, "backup-output");
  await mkdir(nestedGenerations);
  const store = new SqliteLifecycleStore({ path: paths.database });
  t.after(() => store.close());
  await assert.rejects(
    prepareBackupGeneration({
      lifecycleStore: store,
      thoughtDataRoot: paths.thoughts,
      generationRoot: nestedGenerations,
      producerVersion: "1.2.0",
      profileId: "trial-v1",
      createGenerationId: () => "generation_overlap_01234567",
      withWritesPaused: (action) => action(),
    }),
    /overlap/,
  );
});
