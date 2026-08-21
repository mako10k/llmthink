import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  chmodSync,
  closeSync,
  lstatSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, isAbsolute } from "node:path";
import { pipeline } from "node:stream/promises";
import { z } from "zod";

export const RESTIC_OPERATIONAL_VERSION = "0.19.1" as const;
export const RESTIC_RELEASE_TAG = "v0.19.1" as const;
export const RESTIC_LINUX_AMD64_ASSET =
  "restic_0.19.1_linux_amd64.bz2" as const;
export const RESTIC_LINUX_AMD64_SHA256 =
  "f415415624dcc452f2a02b8c33641791a8c6d6d3b65bbb3543fcf9a25151585c" as const;
export const RESTIC_SIGNING_FINGERPRINT =
  "CF8F18F2844575973F79D4E191A6868BD3F7A907" as const;

const MAX_METADATA_BYTES = 1024 * 1024;
const SHA256 = /^[0-9a-f]{64}$/;
const SAFE_VERIFIER = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

export const resticSupplyReceiptSchema = z
  .object({
    format: z.literal("llmthink-restic-supply-receipt-v1"),
    release_tag: z.literal(RESTIC_RELEASE_TAG),
    asset_name: z.literal(RESTIC_LINUX_AMD64_ASSET),
    source_url: z.literal(
      `https://github.com/restic/restic/releases/download/${RESTIC_RELEASE_TAG}/${RESTIC_LINUX_AMD64_ASSET}`,
    ),
    signing_fingerprint: z.literal(RESTIC_SIGNING_FINGERPRINT),
    compressed_sha256: z.literal(RESTIC_LINUX_AMD64_SHA256),
    binary_sha256: z.string().regex(SHA256),
    restic_version: z.literal(RESTIC_OPERATIONAL_VERSION),
    platform: z.literal("linux/amd64"),
    verified_at: z.string().datetime({ offset: true }),
    verifier: z.string().regex(SAFE_VERIFIER),
  })
  .strict();

export type ResticSupplyReceipt = z.infer<typeof resticSupplyReceiptSchema>;

export class ResticSupplyError extends Error {
  readonly code:
    | "invalid_configuration"
    | "unsafe_input"
    | "signature_invalid"
    | "checksum_invalid"
    | "decompression_failed"
    | "version_mismatch"
    | "receipt_failed";

  constructor(code: ResticSupplyError["code"]) {
    super(code);
    this.name = "ResticSupplyError";
    this.code = code;
  }
}

interface ProcessResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ResticSupplyOptions {
  readonly assetPath: string;
  readonly checksumsPath: string;
  readonly signaturePath: string;
  readonly keyringPath: string;
  readonly outputBinaryPath: string;
  readonly outputReceiptPath: string;
  readonly verifier: string;
  readonly gpgvExecutable?: string;
  readonly bzip2Executable?: string;
  readonly now?: () => Date;
  readonly run?: (
    executable: string,
    args: readonly string[],
  ) => Promise<ProcessResult>;
  readonly decompress?: (
    assetPath: string,
    outputBinaryPath: string,
    bzip2Executable: string,
  ) => Promise<void>;
  readonly hashFile?: (path: string) => Promise<string>;
}

async function runProcess(
  executable: string,
  args: readonly string[],
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], {
      env: { PATH: "/usr/bin:/bin", LANG: "C" },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (Buffer.byteLength(stdout) > MAX_METADATA_BYTES) child.kill("SIGKILL");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (Buffer.byteLength(stderr) > MAX_METADATA_BYTES) child.kill("SIGKILL");
    });
    child.once("error", reject);
    child.once("close", (exitCode, signal) =>
      resolve({ exitCode, signal, stdout, stderr }),
    );
  });
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function requireRegularInput(path: string): void {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new ResticSupplyError("unsafe_input");
  } catch (error) {
    if (error instanceof ResticSupplyError) throw error;
    throw new ResticSupplyError("unsafe_input");
  }
}

function requireAbsent(path: string): void {
  try {
    const descriptor = openSync(path, "wx", 0o600);
    closeSync(descriptor);
  } catch {
    throw new ResticSupplyError("invalid_configuration");
  }
}

async function decompressBzip2(
  assetPath: string,
  outputBinaryPath: string,
  executable: string,
): Promise<void> {
  const child = spawn(executable, ["--decompress", "--stdout", assetPath], {
    env: { PATH: "/usr/bin:/bin", LANG: "C" },
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
    if (Buffer.byteLength(stderr) > MAX_METADATA_BYTES) child.kill("SIGKILL");
  });
  const output = createWriteStream(outputBinaryPath, {
    flags: "r+",
    mode: 0o700,
  });
  const completion = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  try {
    await pipeline(child.stdout, output);
    const result = await completion;
    if (result.code !== 0 || result.signal !== null || stderr.trim() !== "")
      throw new ResticSupplyError("decompression_failed");
  } catch {
    throw new ResticSupplyError("decompression_failed");
  }
}

function checksumFromSignedList(contents: string): string {
  const matches = contents
    .split("\n")
    .map((line) => line.match(/^([0-9a-f]{64}) {2}(\S+)$/))
    .filter(
      (match): match is RegExpMatchArray =>
        match !== null && match[2] === RESTIC_LINUX_AMD64_ASSET,
    );
  if (matches.length !== 1 || matches[0]?.[1] !== RESTIC_LINUX_AMD64_SHA256)
    throw new ResticSupplyError("checksum_invalid");
  return matches[0][1];
}

function validateConfiguration(options: ResticSupplyOptions): void {
  const paths = [
    options.assetPath,
    options.checksumsPath,
    options.signaturePath,
    options.keyringPath,
    options.outputBinaryPath,
    options.outputReceiptPath,
    options.gpgvExecutable ?? "/usr/bin/gpgv",
    options.bzip2Executable ?? "/usr/bin/bzip2",
  ];
  if (
    paths.some((path) => !isAbsolute(path)) ||
    basename(options.assetPath) !== RESTIC_LINUX_AMD64_ASSET ||
    !SAFE_VERIFIER.test(options.verifier)
  )
    throw new ResticSupplyError("invalid_configuration");
}

function validateInputFiles(options: ResticSupplyOptions): void {
  for (const path of [
    options.assetPath,
    options.checksumsPath,
    options.signaturePath,
    options.keyringPath,
  ])
    requireRegularInput(path);
}

async function verifySignature(
  options: ResticSupplyOptions,
  run: NonNullable<ResticSupplyOptions["run"]>,
): Promise<void> {
  const signature = await run(options.gpgvExecutable ?? "/usr/bin/gpgv", [
    "--status-fd",
    "1",
    "--keyring",
    options.keyringPath,
    options.signaturePath,
    options.checksumsPath,
  ]).catch(() => {
    throw new ResticSupplyError("signature_invalid");
  });
  const validSignatures = signature.stdout
    .split("\n")
    .filter(
      (line) =>
        line.split(/\s+/).slice(0, 3).join(" ") ===
        `[GNUPG:] VALIDSIG ${RESTIC_SIGNING_FINGERPRINT}`,
    );
  if (
    signature.exitCode !== 0 ||
    signature.signal !== null ||
    validSignatures.length !== 1
  )
    throw new ResticSupplyError("signature_invalid");
}

async function verifyChecksumFiles(
  options: ResticSupplyOptions,
  hashFile: (path: string) => Promise<string>,
): Promise<void> {
  const checksums = readFileSync(options.checksumsPath, {
    encoding: "utf8",
    flag: "r",
  });
  if (Buffer.byteLength(checksums) > MAX_METADATA_BYTES)
    throw new ResticSupplyError("checksum_invalid");
  checksumFromSignedList(checksums);
  if ((await hashFile(options.assetPath)) !== RESTIC_LINUX_AMD64_SHA256)
    throw new ResticSupplyError("checksum_invalid");
}

async function verifyBinaryVersion(
  path: string,
  run: NonNullable<ResticSupplyOptions["run"]>,
): Promise<void> {
  const version = await run(path, ["version"]);
  if (
    version.exitCode !== 0 ||
    version.signal !== null ||
    version.stderr.trim() !== "" ||
    !version.stdout.startsWith(`restic ${RESTIC_OPERATIONAL_VERSION} `) ||
    !version.stdout.includes(" on linux/amd64")
  )
    throw new ResticSupplyError("version_mismatch");
}

function removeReservedBinary(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    // The reserved output may already have been removed; never broaden cleanup.
  }
}

function writeSupplyReceipt(path: string, receipt: ResticSupplyReceipt): void {
  try {
    writeFileSync(path, `${JSON.stringify(receipt)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  } catch {
    throw new ResticSupplyError("receipt_failed");
  }
}

export async function verifyResticSupply(
  options: ResticSupplyOptions,
): Promise<ResticSupplyReceipt> {
  validateConfiguration(options);
  validateInputFiles(options);
  const run = options.run ?? runProcess;
  const hashFile = options.hashFile ?? sha256File;
  await verifySignature(options, run);
  await verifyChecksumFiles(options, hashFile);

  requireAbsent(options.outputBinaryPath);
  try {
    await (options.decompress ?? decompressBzip2)(
      options.assetPath,
      options.outputBinaryPath,
      options.bzip2Executable ?? "/usr/bin/bzip2",
    );
    chmodSync(options.outputBinaryPath, 0o700);
    await verifyBinaryVersion(options.outputBinaryPath, run);

    const receipt = resticSupplyReceiptSchema.parse({
      format: "llmthink-restic-supply-receipt-v1",
      release_tag: RESTIC_RELEASE_TAG,
      asset_name: RESTIC_LINUX_AMD64_ASSET,
      source_url: `https://github.com/restic/restic/releases/download/${RESTIC_RELEASE_TAG}/${RESTIC_LINUX_AMD64_ASSET}`,
      signing_fingerprint: RESTIC_SIGNING_FINGERPRINT,
      compressed_sha256: RESTIC_LINUX_AMD64_SHA256,
      binary_sha256: await hashFile(options.outputBinaryPath),
      restic_version: RESTIC_OPERATIONAL_VERSION,
      platform: "linux/amd64",
      verified_at: (options.now ?? (() => new Date()))().toISOString(),
      verifier: options.verifier,
    });
    writeSupplyReceipt(options.outputReceiptPath, receipt);
    return receipt;
  } catch (error) {
    removeReservedBinary(options.outputBinaryPath);
    if (error instanceof ResticSupplyError) throw error;
    throw new ResticSupplyError("decompression_failed");
  }
}
