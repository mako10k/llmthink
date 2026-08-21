#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
  fail("production_init_missing_credentials_directory");

function credentialPath(name) {
  const path = join(credentials, name);
  const value = readFileSync(path, "utf8");
  if (!value || value.includes("\n") || value.includes("\0"))
    fail("production_init_invalid_credential");
  return { path, value };
}

const endpoint = credentialPath("r2_endpoint");
const accessKey = credentialPath("r2_access_key_id");
const secretKey = credentialPath("r2_secret_access_key");
const repositoryPassword = credentialPath("repository_password");
if (!endpoint.value.match(/^https:\/\/[a-f0-9]+\.r2\.cloudflarestorage\.com$/))
  fail("production_init_invalid_endpoint");
if (
  createHash("sha256").update(readFileSync(RESTIC)).digest("hex") !==
  ACCEPTED_RESTIC_SHA256
)
  fail("production_init_unaccepted_restic");

const root = mkdtempSync(join(tmpdir(), "llmthink-production-init-"));
const cache = join(root, "cache");
mkdirSync(cache, { mode: 0o700 });

const env = {
  PATH: "/usr/bin:/bin",
  LANG: "C",
  AWS_ACCESS_KEY_ID: accessKey.value,
  AWS_SECRET_ACCESS_KEY: secretKey.value,
  RESTIC_REPOSITORY: `s3:${endpoint.value}/${BUCKET}`,
  RESTIC_PASSWORD_FILE: repositoryPassword.path,
  RESTIC_CACHE_DIR: cache,
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

function restic(args, label) {
  commands += 1;
  if (commands > 5) fail("production_init_command_ceiling");
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
    result.stderr.trim() !== ""
  )
    fail(`production_init_command_failed:${label}`);
  return result.stdout;
}

try {
  restic(["init", "--repository-version", "2"], "init");
  restic(["check"], "structural-check");
  restic(["check", "--read-data"], "full-data-check");
  const snapshots = JSON.parse(restic(["snapshots", "--json"], "snapshots"));
  if (!Array.isArray(snapshots) || snapshots.length !== 0)
    fail("production_init_repository_not_empty");

  process.stdout.write(
    `${JSON.stringify({
      format: "llmthink-restic-production-init-v1",
      result: "passed",
      restic_version: "0.19.1",
      repository_format: 2,
      snapshots: 0,
      commands,
      live_data_uploaded: false,
    })}\n`,
  );
} finally {
  rmSync(root, { recursive: true, force: false });
}
