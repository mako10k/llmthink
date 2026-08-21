import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { z } from "zod";

import type { BackupReceipt } from "./contracts.js";

const MAX_OUTPUT_BYTES = 1024 * 1024;
const SNAPSHOT_ID = /^[0-9a-f]{64}$/;
const SAFE_VALUE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

export interface ResticProcessRequest {
  readonly executable: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
}

export interface ResticProcessResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
}

export type ResticProcessRunner = (
  request: ResticProcessRequest,
) => Promise<ResticProcessResult>;

export interface ResticBackupOptions {
  readonly executable: string;
  readonly expectedVersion: string;
  readonly repository: string;
  readonly passwordFile: string;
  readonly cacheDirectory: string;
  readonly generationPath: string;
  readonly generationId: string;
  readonly manifestSha256: `sha256:${string}`;
  readonly profileId: string;
  readonly accessKeyId?: string;
  readonly secretAccessKey?: string;
  readonly sessionToken?: string;
  readonly timeoutMs?: number;
  readonly runner?: ResticProcessRunner;
  readonly now?: () => Date;
}

export interface ResticRestoreOptions {
  readonly executable: string;
  readonly expectedVersion: string;
  readonly repository: string;
  readonly passwordFile: string;
  readonly cacheDirectory: string;
  readonly snapshotId: string;
  readonly originalGenerationPath: string;
  readonly restoreRoot: string;
  readonly profileId: string;
  readonly accessKeyId?: string;
  readonly secretAccessKey?: string;
  readonly sessionToken?: string;
  readonly timeoutMs?: number;
  readonly runner?: ResticProcessRunner;
}

export class ResticAdapterError extends Error {
  readonly code:
    | "invalid_configuration"
    | "version_mismatch"
    | "process_failed"
    | "ambiguous_output"
    | "snapshot_mismatch";

  constructor(code: ResticAdapterError["code"]) {
    super(code);
    this.name = "ResticAdapterError";
    this.code = code;
  }
}

const backupMessageSchema = z.discriminatedUnion("message_type", [
  z.object({ message_type: z.literal("status") }).passthrough(),
  z
    .object({
      message_type: z.literal("summary"),
      dry_run: z.boolean().optional().default(false),
      files_new: z.number().int().nonnegative(),
      data_added: z.number().int().nonnegative(),
      snapshot_id: z.string().regex(SNAPSHOT_ID),
    })
    .passthrough(),
]);

const snapshotSchema = z
  .object({
    id: z.string().regex(SNAPSHOT_ID),
    hostname: z.string(),
    tags: z.array(z.string()),
    paths: z.array(z.string()),
    program_version: z.string(),
  })
  .passthrough();

function invalidConfiguration(): never {
  throw new ResticAdapterError("invalid_configuration");
}

function exactEnv(
  options: Pick<
    ResticBackupOptions,
    | "repository"
    | "passwordFile"
    | "cacheDirectory"
    | "profileId"
    | "accessKeyId"
    | "secretAccessKey"
    | "sessionToken"
  >,
): Record<string, string> {
  const env: Record<string, string> = {
    RESTIC_REPOSITORY: options.repository,
    RESTIC_PASSWORD_FILE: options.passwordFile,
    RESTIC_CACHE_DIR: options.cacheDirectory,
    RESTIC_HOST: options.profileId,
  };
  if (options.accessKeyId !== undefined)
    env.AWS_ACCESS_KEY_ID = options.accessKeyId;
  if (options.secretAccessKey !== undefined)
    env.AWS_SECRET_ACCESS_KEY = options.secretAccessKey;
  if (options.sessionToken !== undefined)
    env.AWS_SESSION_TOKEN = options.sessionToken;
  return env;
}

const restoreMessageSchema = z.discriminatedUnion("message_type", [
  z.object({ message_type: z.literal("status") }).passthrough(),
  z
    .object({
      message_type: z.literal("summary"),
      files_skipped: z.number().int().nonnegative().optional().default(0),
      files_deleted: z.number().int().nonnegative().optional().default(0),
    })
    .passthrough(),
]);

export const runResticProcess: ResticProcessRunner = async (request) =>
  new Promise((resolve, reject) => {
    const child = spawn(request.executable, [...request.args], {
      env: { ...request.env },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let exceeded = false;
    const append = (current: string, chunk: Buffer): string => {
      if (
        Buffer.byteLength(current) + chunk.byteLength >
        request.maxOutputBytes
      ) {
        exceeded = true;
        child.kill("SIGKILL");
        return current;
      }
      return current + chunk.toString("utf8");
    };
    child.stdout.on("data", (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });
    child.once("error", reject);
    const timer = setTimeout(() => child.kill("SIGTERM"), request.timeoutMs);
    child.once("close", (exitCode, signal) => {
      clearTimeout(timer);
      if (exceeded) return reject(new ResticAdapterError("ambiguous_output"));
      resolve({ exitCode, signal, stdout, stderr });
    });
  });

async function checkedRun(
  runner: ResticProcessRunner,
  request: ResticProcessRequest,
): Promise<ResticProcessResult> {
  let result: ResticProcessResult;
  try {
    result = await runner(request);
  } catch {
    throw new ResticAdapterError("process_failed");
  }
  if (
    result.exitCode !== 0 ||
    result.signal !== null ||
    result.stderr.trim() !== ""
  ) {
    throw new ResticAdapterError("process_failed");
  }
  return result;
}

function parseJsonLines(
  stdout: string,
): readonly z.infer<typeof backupMessageSchema>[] {
  const lines = stdout.split("\n").filter((line) => line.trim() !== "");
  if (lines.length === 0) throw new ResticAdapterError("ambiguous_output");
  return lines.map((line) => {
    try {
      return backupMessageSchema.parse(JSON.parse(line));
    } catch {
      throw new ResticAdapterError("ambiguous_output");
    }
  });
}

function validateOptions(options: ResticBackupOptions): void {
  const absolutePaths = [
    options.executable,
    options.passwordFile,
    options.cacheDirectory,
    options.generationPath,
  ];
  if (
    absolutePaths.some((path) => !isAbsolute(path)) ||
    !SAFE_VALUE.test(options.expectedVersion) ||
    !SAFE_VALUE.test(options.profileId) ||
    !SAFE_VALUE.test(options.generationId)
  ) {
    invalidConfiguration();
  }
}

function requireBackupSummary(
  messages: readonly z.infer<typeof backupMessageSchema>[],
): Extract<z.infer<typeof backupMessageSchema>, { message_type: "summary" }> {
  const summaries = messages.filter(
    (message) => message.message_type === "summary",
  );
  const summary = summaries[0];
  if (
    summaries.length !== 1 ||
    messages.at(-1)?.message_type !== "summary" ||
    !summary ||
    summary.dry_run
  ) {
    throw new ResticAdapterError("ambiguous_output");
  }
  return summary;
}

function requireExactSnapshot(
  snapshots: readonly z.infer<typeof snapshotSchema>[],
  expected: {
    readonly snapshotId: string;
    readonly profileId: string;
    readonly tag: string;
    readonly generationPath: string;
  },
): void {
  const snapshot = snapshots[0];
  if (
    snapshots.length !== 1 ||
    snapshot?.id !== expected.snapshotId ||
    snapshot.hostname !== expected.profileId ||
    !snapshot.tags.includes(expected.tag) ||
    !snapshot.tags.includes("llmthink-backup-v1") ||
    snapshot.paths.length !== 1 ||
    snapshot.paths[0] !== expected.generationPath
  ) {
    throw new ResticAdapterError("snapshot_mismatch");
  }
}

export async function backupGenerationWithRestic(
  options: ResticBackupOptions,
): Promise<BackupReceipt> {
  validateOptions(options);
  const runner = options.runner ?? runResticProcess;
  const timeoutMs = options.timeoutMs ?? 30 * 60 * 1000;
  const env = exactEnv(options);
  const request = (args: readonly string[]): ResticProcessRequest => ({
    executable: options.executable,
    args,
    env,
    timeoutMs,
    maxOutputBytes: MAX_OUTPUT_BYTES,
  });

  const version = await checkedRun(runner, request(["version"]));
  if (
    !version.stdout.startsWith(`restic ${options.expectedVersion} `) &&
    version.stdout.trim() !== `restic ${options.expectedVersion}`
  ) {
    throw new ResticAdapterError("version_mismatch");
  }

  const tag = `generation:${options.generationId}`;
  const backup = await checkedRun(
    runner,
    request([
      "backup",
      "--json",
      "--host",
      options.profileId,
      "--tag",
      "llmthink-backup-v1",
      "--tag",
      tag,
      options.generationPath,
    ]),
  );
  const summary = requireBackupSummary(parseJsonLines(backup.stdout));

  const observed = await checkedRun(
    runner,
    request([
      "snapshots",
      "--json",
      "--host",
      options.profileId,
      "--tag",
      tag,
      "--path",
      options.generationPath,
    ]),
  );
  let snapshots: z.infer<typeof snapshotSchema>[];
  try {
    snapshots = z.array(snapshotSchema).parse(JSON.parse(observed.stdout));
  } catch {
    throw new ResticAdapterError("ambiguous_output");
  }
  requireExactSnapshot(snapshots, {
    snapshotId: summary.snapshot_id,
    profileId: options.profileId,
    tag,
    generationPath: options.generationPath,
  });
  return {
    format: "llmthink-backup-receipt-v1",
    generation_id: options.generationId,
    manifest_sha256: options.manifestSha256,
    snapshot_id: summary.snapshot_id,
    repository_format: 2,
    restic_version: options.expectedVersion,
    profile_id: options.profileId,
    tags: ["llmthink-backup-v1", tag],
    files_new: summary.files_new,
    bytes_added: summary.data_added,
    snapshot_observed_at: (options.now ?? (() => new Date()))().toISOString(),
    check_state: "not_checked",
  };
}

function validateRestoreOptions(options: ResticRestoreOptions): void {
  const paths = [
    options.executable,
    options.passwordFile,
    options.cacheDirectory,
    options.originalGenerationPath,
    options.restoreRoot,
  ];
  if (
    paths.some((path) => !isAbsolute(path)) ||
    existsSync(options.restoreRoot) ||
    !SNAPSHOT_ID.test(options.snapshotId) ||
    !SAFE_VALUE.test(options.expectedVersion) ||
    !SAFE_VALUE.test(options.profileId)
  ) {
    invalidConfiguration();
  }
}

function parseRestoreSummary(
  stdout: string,
): Extract<z.infer<typeof restoreMessageSchema>, { message_type: "summary" }> {
  let messages: z.infer<typeof restoreMessageSchema>[];
  try {
    messages = stdout
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => restoreMessageSchema.parse(JSON.parse(line)));
  } catch {
    throw new ResticAdapterError("ambiguous_output");
  }
  const summaries = messages.filter(
    (message) => message.message_type === "summary",
  );
  const summary = summaries[0];
  if (
    summaries.length !== 1 ||
    messages.at(-1)?.message_type !== "summary" ||
    !summary ||
    summary.files_skipped !== 0 ||
    summary.files_deleted !== 0
  ) {
    throw new ResticAdapterError("ambiguous_output");
  }
  return summary;
}

export async function restoreSnapshotWithRestic(
  options: ResticRestoreOptions,
): Promise<string> {
  validateRestoreOptions(options);
  const runner = options.runner ?? runResticProcess;
  const request = (args: readonly string[]): ResticProcessRequest => ({
    executable: options.executable,
    args,
    env: exactEnv(options),
    timeoutMs: options.timeoutMs ?? 30 * 60 * 1000,
    maxOutputBytes: MAX_OUTPUT_BYTES,
  });
  const version = await checkedRun(runner, request(["version"]));
  if (
    !version.stdout.startsWith(`restic ${options.expectedVersion} `) &&
    version.stdout.trim() !== `restic ${options.expectedVersion}`
  ) {
    throw new ResticAdapterError("version_mismatch");
  }
  const restored = await checkedRun(
    runner,
    request([
      "restore",
      options.snapshotId,
      "--target",
      options.restoreRoot,
      "--json",
    ]),
  );
  parseRestoreSummary(restored.stdout);
  return join(options.restoreRoot, options.originalGenerationPath.slice(1));
}
