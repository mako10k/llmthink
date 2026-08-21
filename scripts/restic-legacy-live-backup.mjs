#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import process from "node:process";

const RESTIC = "/opt/llmthink/bin/restic-0.19.1";
const RESTIC_SHA256 =
  "20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639";
const BUCKET = "llmthink-backup-3b38f07b";
const GENERATION_ROOT = "/var/lib/llmthink-backup-generations";
const THOUGHT_ROOT = "/var/lib/llmthink/data";
const REGISTRY = "/etc/llmthink/oauth-accounts.json";
const ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const [phase, generationId] = process.argv.slice(2);

function fail(code) {
  throw new Error(code);
}

if (!ID.test(generationId ?? "")) fail("legacy_backup_invalid_generation_id");
const generationPath = join(GENERATION_ROOT, generationId);

function assertBelow(root, path) {
  const rel = relative(root, path);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`))
    fail("legacy_backup_path_escape");
}

function copyTree(source, target) {
  const sourceRoot = realpathSync(source);
  mkdirSync(target, { mode: 0o700 });
  const walk = (current, destination) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const from = join(current, entry.name);
      const to = join(destination, entry.name);
      assertBelow(sourceRoot, from);
      if (entry.isSymbolicLink()) fail("legacy_backup_symlink_rejected");
      if (entry.isDirectory()) {
        mkdirSync(to, { mode: 0o700 });
        walk(from, to);
      } else if (entry.isFile()) {
        const sourceFd = openSync(
          from,
          constants.O_RDONLY | constants.O_NOFOLLOW,
        );
        try {
          copyFileSync(
            `/proc/self/fd/${sourceFd}`,
            to,
            constants.COPYFILE_EXCL,
          );
          chmodSync(to, 0o600);
        } finally {
          closeSync(sourceFd);
        }
      } else fail("legacy_backup_special_file_rejected");
    }
  };
  walk(sourceRoot, target);
}

function treeDigest(root) {
  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) files.push(path);
      else fail("legacy_backup_prepared_tree_unsafe");
    }
  };
  walk(root);
  files.sort();
  const digest = createHash("sha256");
  let bytes = 0;
  for (const path of files) {
    const content = readFileSync(path);
    bytes += content.length;
    digest.update(relative(root, path));
    digest.update("\0");
    digest.update(createHash("sha256").update(content).digest("hex"));
    digest.update("\n");
  }
  return {
    sha256: `sha256:${digest.digest("hex")}`,
    bytes,
    files: files.length,
  };
}

if (phase === "prepare") {
  if (realpathSync(dirname(GENERATION_ROOT)) !== "/var/lib")
    fail("legacy_backup_generation_parent_invalid");
  mkdirSync(GENERATION_ROOT, { mode: 0o700 });
  mkdirSync(generationPath, { mode: 0o700 });
  try {
    copyTree(THOUGHT_ROOT, join(generationPath, "thought-data"));
    const registryFd = openSync(
      REGISTRY,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      copyFileSync(
        `/proc/self/fd/${registryFd}`,
        join(generationPath, "oauth-accounts.json"),
        constants.COPYFILE_EXCL,
      );
      chmodSync(join(generationPath, "oauth-accounts.json"), 0o600);
    } finally {
      closeSync(registryFd);
    }
    const thoughts = treeDigest(join(generationPath, "thought-data"));
    const registryContent = readFileSync(
      join(generationPath, "oauth-accounts.json"),
    );
    const manifest = {
      format: "llmthink-legacy-recovery-generation-v1",
      generation_id: generationId,
      recovery_point_at: new Date().toISOString(),
      components: [
        { name: "thought-data", ...thoughts },
        {
          name: "oauth-accounts.json",
          sha256: `sha256:${createHash("sha256").update(registryContent).digest("hex")}`,
          bytes: registryContent.length,
          files: 1,
        },
      ],
    };
    writeFileSync(
      join(generationPath, "manifest.json"),
      `${JSON.stringify(manifest)}\n`,
      {
        mode: 0o600,
        flag: "wx",
      },
    );
    process.stdout.write(
      `${JSON.stringify({ format: manifest.format, result: "prepared", generation_id: generationId, thought_files: thoughts.files, thought_bytes: thoughts.bytes, registry_bytes: registryContent.length })}\n`,
    );
  } catch (error) {
    rmSync(generationPath, { recursive: true, force: true });
    throw error;
  }
} else if (phase === "upload") {
  const credentials = process.env.CREDENTIALS_DIRECTORY;
  if (!credentials?.startsWith("/run/credentials/"))
    fail("legacy_backup_missing_credentials_directory");
  const credential = (name) => {
    const path = join(credentials, name);
    const value = readFileSync(path, "utf8");
    if (!value || value.includes("\n") || value.includes("\0"))
      fail("legacy_backup_invalid_credential");
    return { path, value };
  };
  const endpoint = credential("r2_endpoint");
  const accessKey = credential("r2_access_key_id");
  const secretKey = credential("r2_secret_access_key");
  const password = credential("repository_password");
  if (
    !endpoint.value.match(/^https:\/\/[a-f0-9]+\.r2\.cloudflarestorage\.com$/)
  )
    fail("legacy_backup_invalid_endpoint");
  if (
    createHash("sha256").update(readFileSync(RESTIC)).digest("hex") !==
    RESTIC_SHA256
  )
    fail("legacy_backup_unaccepted_restic");
  const manifest = JSON.parse(
    readFileSync(join(generationPath, "manifest.json"), "utf8"),
  );
  if (manifest.format !== "llmthink-legacy-recovery-generation-v1")
    fail("legacy_backup_manifest_invalid");
  const cacheRoot = mkdtempSync(join(tmpdir(), "llmthink-legacy-backup-"));
  const cache = join(cacheRoot, "cache");
  const restore = join(cacheRoot, "restore");
  mkdirSync(cache, { mode: 0o700 });
  const env = {
    PATH: "/usr/bin:/bin",
    LANG: "C",
    AWS_ACCESS_KEY_ID: accessKey.value,
    AWS_SECRET_ACCESS_KEY: secretKey.value,
    RESTIC_REPOSITORY: `s3:${endpoint.value}/${BUCKET}`,
    RESTIC_PASSWORD_FILE: password.path,
    RESTIC_CACHE_DIR: cache,
  };
  const fixed = [
    "-o",
    "s3.retries=0",
    "-o",
    "s3.connections=2",
    "-o",
    "s3.region=auto",
  ];
  let commands = 0;
  const restic = (args, label) => {
    commands += 1;
    if (commands > 8) fail("legacy_backup_command_ceiling");
    const result = spawnSync(RESTIC, [...fixed, ...args], {
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
    )
      fail(`legacy_backup_command_failed:${label}`);
    return result.stdout;
  };
  try {
    const output = restic(
      [
        "backup",
        "--json",
        "--host",
        "llmthink-legacy-v1",
        "--tag",
        "llmthink-legacy-recovery-v1",
        "--tag",
        `generation:${generationId}`,
        generationPath,
      ],
      "backup",
    );
    const summaries = output
      .split("\n")
      .filter(Boolean)
      .map(JSON.parse)
      .filter((item) => item.message_type === "summary");
    const snapshotId = summaries[0]?.snapshot_id;
    if (summaries.length !== 1 || !snapshotId?.match(/^[0-9a-f]{64}$/))
      fail("legacy_backup_summary_invalid");
    const observed = JSON.parse(
      restic(
        [
          "snapshots",
          "--json",
          "--host",
          "llmthink-legacy-v1",
          "--tag",
          `generation:${generationId}`,
          "--path",
          generationPath,
        ],
        "snapshot-reread",
      ),
    );
    if (observed.length !== 1 || observed[0]?.id !== snapshotId)
      fail("legacy_backup_snapshot_mismatch");
    restic(["check"], "structural-check");
    restic(["check", "--read-data"], "full-data-check");
    restic(["restore", snapshotId, "--target", restore, "--json"], "restore");
    const restoredGeneration = join(restore, generationPath);
    const originalDigest = treeDigest(generationPath);
    const restoredDigest = treeDigest(restoredGeneration);
    if (JSON.stringify(originalDigest) !== JSON.stringify(restoredDigest))
      fail("legacy_backup_restore_mismatch");
    process.stdout.write(
      `${JSON.stringify({ format: "llmthink-legacy-live-backup-v1", result: "passed", generation_id: generationId, snapshot_id: snapshotId, repository_format: 2, restic_version: "0.19.1", commands, restored_files: restoredDigest.files, restored_bytes: restoredDigest.bytes })}\n`,
    );
  } finally {
    rmSync(cacheRoot, { recursive: true, force: true });
  }
} else if (phase === "cleanup") {
  assertBelow(GENERATION_ROOT, resolve(generationPath));
  rmSync(generationPath, { recursive: true, force: false });
  process.stdout.write('{"result":"local_generation_removed"}\n');
} else fail("legacy_backup_invalid_phase");
