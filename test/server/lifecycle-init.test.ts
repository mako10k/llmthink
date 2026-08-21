import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { initializeLifecycleDatabase } from "../../src/server/lifecycle-init.js";
import { SqliteLifecycleStore } from "../../src/server/sqlite-lifecycle-store.js";

test("sealed manifest initializes an absent lifecycle database exactly once", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "llmthink-lifecycle-init-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const database = join(root, "lifecycle.sqlite");
  const manifest = resolve("docs/process/trial-lifecycle-init-manifest.json");
  const receipt = initializeLifecycleDatabase(database, manifest);
  assert.equal(
    receipt.terms_sha256,
    "b40e20f16af8f927027b34ca97c8a729d65178a93f999006f77e8a3821723af1",
  );
  assert.equal(
    receipt.privacy_notice_sha256,
    "88028714e007f7aea2c5ef829b9fa42a9c428136eb3a8ced942669e83c9be610",
  );
  const store = new SqliteLifecycleStore({ path: database });
  assert.equal(
    store.activeTermsArtifact("trial-terms-ja-v1").version,
    "trial-terms-ja-2026-08-v1",
  );
  store.close();
  assert.throws(
    () => initializeLifecycleDatabase(database, manifest),
    /already exists/,
  );
});

test("digest mismatch removes the newly-created database and fails closed", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "llmthink-lifecycle-init-bad-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = resolve("docs/process/trial-lifecycle-init-manifest.json");
  const manifest = join(root, "manifest.json");
  const parsed = JSON.parse(await readFile(source, "utf8"));
  parsed.terms.content_path = resolve("docs/legal/trial-terms-ja-v1.md");
  parsed.terms.summary_path = resolve(
    "docs/legal/trial-important-summary-ja-v1.md",
  );
  parsed.privacy_notice.content_path = resolve(
    "docs/legal/trial-privacy-notice-ja-v2.md",
  );
  parsed.terms.content_sha256 = "0".repeat(64);
  await writeFile(manifest, JSON.stringify(parsed));
  const database = join(root, "lifecycle.sqlite");
  assert.throws(
    () => initializeLifecycleDatabase(database, manifest),
    /digest mismatch/,
  );
  await assert.rejects(readFile(database));
});
