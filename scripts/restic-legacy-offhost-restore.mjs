#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";

const SNAPSHOT =
  "18c7800bf1020f1e431d00b765f29bfa848aec44367764394fb48424c85df826";
const GENERATION = "eed8c2fb-4766-427d-816e-1bc6dc0d8c1e";
const ORIGINAL_PATH = `/var/lib/llmthink-backup-generations/${GENERATION}`;
const BUCKET = "llmthink-backup-3b38f07b";
const RESTIC_SHA256 =
  "20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639";
const [restic, root] = process.argv.slice(2);

function fail(code) {
  throw new Error(code);
}

if (
  !restic?.startsWith("/") ||
  !root?.startsWith("/") ||
  existsSync(join(root, "restore"))
)
  fail("offhost_restore_invalid_paths");
if (
  createHash("sha256").update(readFileSync(restic)).digest("hex") !==
  RESTIC_SHA256
)
  fail("offhost_restore_unaccepted_restic");

const endpoint = process.env.LLMTHINK_RECOVERY_R2_ENDPOINT;
const accessKey = process.env.LLMTHINK_RECOVERY_R2_ACCESS_KEY_ID;
const secretKey = process.env.LLMTHINK_RECOVERY_R2_SECRET_ACCESS_KEY;
const password = process.env.LLMTHINK_RECOVERY_RESTIC_PASSWORD;
for (const value of [endpoint, accessKey, secretKey, password])
  if (!value || value.includes("\n") || value.includes("\0"))
    fail("offhost_restore_invalid_credential");
if (!endpoint.match(/^https:\/\/[a-f0-9]+\.r2\.cloudflarestorage\.com$/))
  fail("offhost_restore_invalid_endpoint");

const cache = join(root, "cache");
const restore = join(root, "restore");
mkdirSync(cache, { mode: 0o700 });
const env = {
  PATH: "/usr/bin:/bin",
  LANG: "C",
  AWS_ACCESS_KEY_ID: accessKey,
  AWS_SECRET_ACCESS_KEY: secretKey,
  RESTIC_REPOSITORY: `s3:${endpoint}/${BUCKET}`,
  RESTIC_PASSWORD: password,
  RESTIC_CACHE_DIR: cache,
};
const fixed = [
  "--no-lock",
  "-o",
  "s3.retries=0",
  "-o",
  "s3.connections=2",
  "-o",
  "s3.region=auto",
];
let commands = 0;

function run(args, label) {
  commands += 1;
  if (commands > 5) fail("offhost_restore_command_ceiling");
  const result = spawnSync(restic, [...fixed, ...args], {
    env,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    timeout: 10 * 60 * 1000,
  });
  if (
    result.error ||
    result.status !== 0 ||
    result.signal ||
    result.stderr.trim()
  ) {
    const redacted = result.stderr
      .replaceAll(endpoint, "<endpoint>")
      .replaceAll(accessKey, "<access-key>")
      .replaceAll(secretKey, "<secret-key>")
      .replaceAll(password, "<repository-password>")
      .replace(/[0-9a-f]{24,}/gi, "<opaque-id>")
      .slice(0, 800);
    process.stderr.write(redacted);
    const diagnostic = [
      [
        /access denied|accessdenied|forbidden|status code: 403/i,
        "access_denied",
      ],
      [/wrong password|no key found|unable to decrypt/i, "password_rejected"],
      [
        /repository does not exist|unable to open config/i,
        "repository_not_found",
      ],
      [/timeout|timed out|deadline exceeded/i, "timeout"],
    ].find(([pattern]) => pattern.test(result.stderr))?.[1];
    fail(
      `offhost_restore_command_failed:${label}:${diagnostic ?? "unclassified"}`,
    );
  }
  return result.stdout;
}

function collectTree(treeRoot) {
  const files = [];
  const directories = [];
  const walk = (directory) => {
    directories.push(directory);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) fail("offhost_restore_symlink_rejected");
      if (stat.isDirectory()) walk(path);
      else if (stat.isFile()) files.push(path);
      else fail("offhost_restore_special_file_rejected");
    }
  };
  walk(treeRoot);
  files.sort();
  const digest = createHash("sha256");
  let bytes = 0;
  for (const path of files) {
    const content = readFileSync(path);
    bytes += content.length;
    digest.update(relative(treeRoot, path));
    digest.update("\0");
    digest.update(createHash("sha256").update(content).digest("hex"));
    digest.update("\n");
  }
  return {
    sha256: `sha256:${digest.digest("hex")}`,
    bytes,
    files: files.length,
    directories: directories.length,
  };
}

function validateRegistry(path, expected) {
  const content = readFileSync(path);
  if (
    `sha256:${createHash("sha256").update(content).digest("hex")}` !==
      expected.sha256 ||
    content.length !== expected.bytes
  )
    fail("offhost_restore_registry_digest_mismatch");
  let value;
  try {
    value = JSON.parse(content.toString("utf8"));
  } catch {
    fail("offhost_restore_registry_invalid");
  }
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== "accounts,version" ||
    value.version !== 1 ||
    !Array.isArray(value.accounts)
  )
    fail("offhost_restore_registry_invalid");
  const allowed = new Set([
    "issuer",
    "external_subject_id",
    "organization_id",
    "subject_id",
    "tenant_id",
    "workspace_id",
    "scopes",
    "status",
    "mapping_revision",
  ]);
  for (const account of value.accounts) {
    if (!account || typeof account !== "object" || Array.isArray(account))
      fail("offhost_restore_registry_invalid");
    if (Object.keys(account).some((key) => !allowed.has(key)))
      fail("offhost_restore_registry_invalid");
  }
  return value.accounts.length;
}

try {
  const version = run(["version"], "version");
  if (!version.startsWith("restic 0.19.1 "))
    fail("offhost_restore_version_mismatch");
  const snapshots = JSON.parse(
    run(
      [
        "snapshots",
        "--json",
        "--host",
        "llmthink-legacy-v1",
        "--tag",
        `generation:${GENERATION}`,
        "--path",
        ORIGINAL_PATH,
      ],
      "snapshot",
    ),
  );
  const snapshot = snapshots[0];
  if (
    snapshots.length !== 1 ||
    snapshot?.id !== SNAPSHOT ||
    snapshot.hostname !== "llmthink-legacy-v1" ||
    snapshot.paths?.length !== 1 ||
    snapshot.paths[0] !== ORIGINAL_PATH ||
    !snapshot.tags?.includes("llmthink-legacy-recovery-v1") ||
    !snapshot.tags?.includes(`generation:${GENERATION}`)
  )
    fail("offhost_restore_snapshot_mismatch");
  run(["check", "--read-data"], "full-data-check");
  run(["restore", SNAPSHOT, "--target", restore, "--json"], "restore");
  const generationRoot = join(restore, ORIGINAL_PATH);
  const entries = readdirSync(generationRoot).sort();
  if (entries.join(",") !== "manifest.json,oauth-accounts.json,thought-data")
    fail("offhost_restore_generation_shape_invalid");
  const manifest = JSON.parse(
    readFileSync(join(generationRoot, "manifest.json"), "utf8"),
  );
  if (
    manifest.format !== "llmthink-legacy-recovery-generation-v1" ||
    manifest.generation_id !== GENERATION ||
    !Array.isArray(manifest.components) ||
    manifest.components.length !== 2
  )
    fail("offhost_restore_manifest_invalid");
  const thoughtClaim = manifest.components.find(
    ({ name }) => name === "thought-data",
  );
  const registryClaim = manifest.components.find(
    ({ name }) => name === "oauth-accounts.json",
  );
  if (!thoughtClaim || !registryClaim) fail("offhost_restore_manifest_invalid");
  const thoughts = collectTree(join(generationRoot, "thought-data"));
  if (
    thoughts.sha256 !== thoughtClaim.sha256 ||
    thoughts.bytes !== thoughtClaim.bytes ||
    thoughts.files !== thoughtClaim.files
  )
    fail("offhost_restore_thought_digest_mismatch");
  const registryAccounts = validateRegistry(
    join(generationRoot, "oauth-accounts.json"),
    registryClaim,
  );
  process.stdout.write(
    `${JSON.stringify({ format: "llmthink-legacy-offhost-restore-v1", result: "passed", snapshot_id: SNAPSHOT, generation_id: GENERATION, restic_version: "0.19.1", repository_format: 2, commands, thought_files: thoughts.files, thought_bytes: thoughts.bytes, thought_directories: thoughts.directories, registry_accounts: registryAccounts, activation_performed: false })}\n`,
  );
} finally {
  rmSync(cache, { recursive: true, force: true });
  rmSync(restore, { recursive: true, force: true });
}
