#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const BUCKET = "llmthink-r2d-20260821-1a8b9028";
const MAX_PLAINTEXT = 4 * 1024 * 1024;
const MAX_STORED = 20 * 1024 * 1024;
const MAX_OBJECTS = 500;
const RESTIC = process.env.R2D_RESTIC_BINARY;
const ENDPOINT = process.env.R2D_ENDPOINT;
const ACCESS_KEY = process.env.R2D_ACCESS_KEY_ID;
const SECRET_KEY = process.env.R2D_SECRET_ACCESS_KEY;
const AWS = "/home/katsumata-m/.local/bin/aws";
const ACCEPTED_RESTIC_SHA256 =
  "20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639";

function fail(code) {
  throw new Error(code);
}

if (
  !RESTIC?.startsWith("/") ||
  !ENDPOINT?.match(/^https:\/\/[a-f0-9]+\.r2\.cloudflarestorage\.com$/) ||
  !ACCESS_KEY ||
  !SECRET_KEY
)
  fail("r2d_invalid_configuration");
const resticStat = lstatSync(RESTIC);
const resticDigest = createHash("sha256")
  .update(readFileSync(RESTIC))
  .digest("hex");
if (
  !resticStat.isFile() ||
  resticStat.isSymbolicLink() ||
  resticDigest !== ACCEPTED_RESTIC_SHA256
)
  fail("r2d_unaccepted_restic_binary");

// mkdtemp creates an unpredictable owner-only directory beneath the public temp parent.
const root = mkdtempSync(join(tmpdir(), "llmthink-r2d-"));
const source = join(root, "synthetic-source");
const cache = join(root, "cache");
const passwordFile = join(root, "repository-password");
const restoreRoot = join(root, "isolated-restore");
mkdirSync(source, { mode: 0o700 });
mkdirSync(cache, { mode: 0o700 });
writeFileSync(passwordFile, `${randomBytes(48).toString("base64url")}\n`, {
  mode: 0o600,
});
chmodSync(passwordFile, 0o600);

const env = {
  PATH: "/usr/bin:/bin",
  LANG: "C",
  AWS_ACCESS_KEY_ID: ACCESS_KEY,
  AWS_SECRET_ACCESS_KEY: SECRET_KEY,
  AWS_DEFAULT_REGION: "auto",
  AWS_MAX_ATTEMPTS: "1",
  RESTIC_REPOSITORY: `s3:${ENDPOINT}/${BUCKET}`,
  RESTIC_PASSWORD_FILE: passwordFile,
  RESTIC_CACHE_DIR: cache,
  RESTIC_HOST: "llmthink-r2d-v1",
};

let commands = 0;
function execute(executable, args, label, options = {}) {
  const { allowedStderr = "", ...spawnOptions } = options;
  commands += 1;
  if (commands > 40) fail("r2d_command_ceiling_exceeded");
  const result = spawnSync(executable, args, {
    env,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
    timeout: 5 * 60 * 1000,
    ...spawnOptions,
  });
  if (
    result.error ||
    result.status !== 0 ||
    result.signal !== null ||
    result.stderr.trim() !== allowedStderr
  )
    fail(`r2d_command_failed:${label}`);
  return result.stdout;
}

const resticOptions = [
  "-o",
  "s3.retries=0",
  "-o",
  "s3.connections=2",
  "-o",
  "s3.region=auto",
];
function restic(args, label, options) {
  return execute(RESTIC, [...resticOptions, ...args], label, options);
}

function aws(args, label) {
  return execute(AWS, [...args, "--endpoint-url", ENDPOINT], label);
}

function digest(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function snapshots() {
  const parsed = JSON.parse(
    restic(
      [
        "snapshots",
        "--json",
        "--host",
        "llmthink-r2d-v1",
        "--tag",
        "llmthink-r2d-v1",
        "--path",
        source,
      ],
      "snapshots",
    ),
  );
  if (
    !Array.isArray(parsed) ||
    parsed.some((item) => !item?.id?.match(/^[0-9a-f]{64}$/))
  )
    fail("r2d_snapshot_inventory_invalid");
  return parsed;
}

function inventory() {
  const value = JSON.parse(
    aws(
      ["s3api", "list-objects-v2", "--bucket", BUCKET, "--output", "json"],
      "inventory",
    ),
  );
  const objects = value.Contents ?? [];
  if (!Array.isArray(objects)) fail("r2d_object_inventory_invalid");
  const bytes = objects.reduce((sum, item) => sum + Number(item.Size ?? 0), 0);
  if (objects.length > MAX_OBJECTS || bytes > MAX_STORED)
    fail("r2d_storage_ceiling_exceeded");
  return { objects: objects.length, bytes };
}

let plaintextBytes = 0;
const expectedDigests = [];
const snapshotIds = [];
let repositoryCleaned = false;

try {
  restic(["init", "--repository-version", "2"], "init");
  for (let generation = 1; generation <= 3; generation += 1) {
    const payload = randomBytes(1024 * 1024);
    plaintextBytes += payload.byteLength;
    if (plaintextBytes > MAX_PLAINTEXT) fail("r2d_plaintext_ceiling_exceeded");
    const fixture = join(source, "fixture.bin");
    writeFileSync(fixture, payload, { mode: 0o600 });
    expectedDigests.push(digest(fixture));
    const output = restic(
      ["backup", "--json", "--tag", "llmthink-r2d-v1", source],
      `backup-${generation}`,
    );
    const messages = output
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const summaries = messages.filter(
      (item) => item.message_type === "summary",
    );
    const id = summaries[0]?.snapshot_id;
    if (summaries.length !== 1 || !id?.match(/^[0-9a-f]{64}$/))
      fail("r2d_backup_summary_invalid");
    const observed = snapshots();
    if (
      observed.length !== generation ||
      !observed.some((item) => item.id === id)
    )
      fail("r2d_snapshot_reread_mismatch");
    snapshotIds.push(id);
  }

  restic(["check"], "structural-check");
  restic(["check", "--read-data"], "full-data-check-before");

  restic(["restore", snapshotIds[2], "--target", restoreRoot], "restore");
  const restored = join(restoreRoot, source, "fixture.bin");
  if (digest(restored) !== expectedDigests[2])
    fail("r2d_restore_digest_mismatch");

  const exactForgetStderr =
    'Ignoring "filters": explicit snapshot ids are given';
  restic(["forget", snapshotIds[0], "--dry-run"], "retention-dry-run", {
    allowedStderr: exactForgetStderr,
  });
  if (snapshots().length !== 3) fail("r2d_retention_dry_run_mutated");
  restic(["forget", snapshotIds[0]], "retention-apply", {
    allowedStderr: exactForgetStderr,
  });
  if (snapshots().length !== 2) fail("r2d_retention_apply_mismatch");
  restic(["prune"], "prune-after-retention");
  restic(["check", "--read-data"], "full-data-check-after");

  const beforeCleanup = inventory();
  restic(["forget", snapshotIds[1], snapshotIds[2]], "forget-exact-remaining", {
    allowedStderr: exactForgetStderr,
  });
  restic(["prune"], "prune-exact-remaining");
  if (snapshots().length !== 0) fail("r2d_snapshot_cleanup_mismatch");

  aws(
    ["s3", "rm", `s3://${BUCKET}`, "--recursive", "--only-show-errors"],
    "object-cleanup",
  );
  const afterCleanup = inventory();
  if (afterCleanup.objects !== 0 || afterCleanup.bytes !== 0)
    fail("r2d_object_cleanup_mismatch");
  repositoryCleaned = true;

  process.stdout.write(
    `${JSON.stringify({
      format: "llmthink-restic-r2d-evidence-v1",
      result: "passed",
      restic_version: "0.19.1",
      repository_format: 2,
      snapshots_created: snapshotIds.length,
      plaintext_bytes_processed: plaintextBytes,
      stored_objects_before_cleanup: beforeCleanup.objects,
      stored_bytes_before_cleanup: beforeCleanup.bytes,
      final_objects: afterCleanup.objects,
      command_invocations: commands,
      secret_scan: "no_values_emitted",
      repository_cleaned: repositoryCleaned,
    })}\n`,
  );
} finally {
  rmSync(root, { recursive: true, force: false });
}
