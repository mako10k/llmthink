#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const BUCKET = "llmthink-backup-3b38f07b";
const RESTIC = "/opt/llmthink/bin/restic-0.19.1";
const ACCEPTED_RESTIC_SHA256 =
  "20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639";
const credentials = process.env.CREDENTIALS_DIRECTORY;

function fail(code) {
  throw new Error(code);
}

if (!credentials?.startsWith("/run/credentials/"))
  fail("vps_rehearsal_missing_credentials_directory");

function credential(name) {
  const value = readFileSync(join(credentials, name), "utf8");
  if (!value || value.includes("\n") || value.includes("\0"))
    fail("vps_rehearsal_invalid_credential");
  return value;
}

const endpoint = credential("r2_endpoint");
const accessKey = credential("r2_access_key_id");
const secretKey = credential("r2_secret_access_key");
if (!endpoint.match(/^https:\/\/[a-f0-9]+\.r2\.cloudflarestorage\.com$/))
  fail("vps_rehearsal_invalid_endpoint");
if (
  createHash("sha256").update(readFileSync(RESTIC)).digest("hex") !==
  ACCEPTED_RESTIC_SHA256
)
  fail("vps_rehearsal_unaccepted_restic");

// mkdtemp creates an unpredictable owner-only directory beneath the service-private temp parent.
const root = mkdtempSync(join(tmpdir(), "llmthink-vps-rehearsal-"));
const source = join(root, "synthetic-source");
const cache = join(root, "cache");
const restoreRoot = join(root, "isolated-restore");
const passwordFile = join(root, "test-password");
mkdirSync(source, { mode: 0o700 });
mkdirSync(cache, { mode: 0o700 });
writeFileSync(passwordFile, `${randomBytes(48).toString("base64url")}\n`, {
  mode: 0o600,
});
chmodSync(passwordFile, 0o600);
const fixture = join(source, "fixture.bin");
writeFileSync(fixture, randomBytes(1024 * 1024), { mode: 0o600 });
const fixtureDigest = createHash("sha256")
  .update(readFileSync(fixture))
  .digest("hex");
const prefix = `rehearsal/${randomBytes(8).toString("hex")}`;

const env = {
  PATH: "/usr/bin:/bin",
  LANG: "C",
  AWS_ACCESS_KEY_ID: accessKey,
  AWS_SECRET_ACCESS_KEY: secretKey,
  RESTIC_REPOSITORY: `s3:${endpoint}/${BUCKET}/${prefix}`,
  RESTIC_PASSWORD_FILE: passwordFile,
  RESTIC_CACHE_DIR: cache,
  RESTIC_HOST: "llmthink-vps-rehearsal-v1",
};
const resticOptions = [
  "-o",
  "s3.retries=0",
  "-o",
  "s3.connections=2",
  "-o",
  "s3.region=auto",
];
let commands = 0;

function restic(args, label, allowedStderr = "") {
  commands += 1;
  if (commands > 20) fail("vps_rehearsal_command_ceiling");
  const result = spawnSync(RESTIC, [...resticOptions, ...args], {
    env,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
    timeout: 5 * 60 * 1000,
  });
  if (
    result.error ||
    result.status !== 0 ||
    result.signal !== null ||
    result.stderr.trim() !== allowedStderr
  )
    fail(`vps_rehearsal_command_failed:${label}`);
  return result.stdout;
}

try {
  restic(["init", "--repository-version", "2"], "init");
  const output = restic(
    ["backup", "--json", "--tag", "llmthink-vps-rehearsal-v1", source],
    "backup",
  );
  const summaries = output
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((item) => item.message_type === "summary");
  const snapshotId = summaries[0]?.snapshot_id;
  if (summaries.length !== 1 || !snapshotId?.match(/^[0-9a-f]{64}$/))
    fail("vps_rehearsal_backup_summary_invalid");

  const observed = JSON.parse(
    restic(
      [
        "snapshots",
        "--json",
        "--host",
        "llmthink-vps-rehearsal-v1",
        "--tag",
        "llmthink-vps-rehearsal-v1",
        "--path",
        source,
      ],
      "snapshot-reread",
    ),
  );
  if (observed.length !== 1 || observed[0]?.id !== snapshotId)
    fail("vps_rehearsal_snapshot_mismatch");

  restic(["check"], "structural-check");
  restic(["check", "--read-data"], "full-data-check");
  restic(["restore", snapshotId, "--target", restoreRoot, "--json"], "restore");
  const restored = join(restoreRoot, source, "fixture.bin");
  const restoredDigest = createHash("sha256")
    .update(readFileSync(restored))
    .digest("hex");
  if (restoredDigest !== fixtureDigest) fail("vps_rehearsal_restore_mismatch");

  const exactForgetStderr =
    'Ignoring "filters": explicit snapshot ids are given';
  restic(["forget", snapshotId], "forget-exact", exactForgetStderr);
  restic(["prune"], "prune");
  const finalSnapshots = JSON.parse(
    restic(["snapshots", "--json"], "final-snapshots"),
  );
  if (!Array.isArray(finalSnapshots) || finalSnapshots.length !== 0)
    fail("vps_rehearsal_snapshot_cleanup_mismatch");

  process.stdout.write(
    `${JSON.stringify({
      format: "llmthink-restic-vps-rehearsal-v1",
      result: "passed",
      restic_version: "0.19.1",
      repository_format: 2,
      synthetic_bytes: 1024 * 1024,
      commands,
      snapshot_id: snapshotId,
      cleanup_prefix: prefix,
      local_plaintext_cleaned: true,
    })}\n`,
  );
} finally {
  rmSync(root, { recursive: true, force: false });
}
