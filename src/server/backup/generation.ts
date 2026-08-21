import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, realpath, rm } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";

import {
  SQLITE_LIFECYCLE_SCHEMA_VERSION,
  type SqliteLifecycleStore,
} from "../sqlite-lifecycle-store.js";
import {
  encodeBackupGenerationManifest,
  type BackupGenerationManifest,
} from "./contracts.js";
import { resolveAbsentBackupDestination } from "./path-policy.js";

export interface BackupGenerationOptions {
  readonly lifecycleStore: SqliteLifecycleStore;
  readonly thoughtDataRoot: string;
  readonly generationRoot: string;
  readonly producerVersion: string;
  readonly profileId: string;
  readonly withWritesPaused: <T>(action: () => Promise<T>) => Promise<T>;
  readonly now?: () => Date;
  readonly createGenerationId?: () => string;
}

export interface PreparedBackupGeneration {
  readonly generationId: string;
  readonly path: string;
  readonly manifest: BackupGenerationManifest;
}

async function copyRegularFile(
  source: string,
  destination: string,
): Promise<void> {
  const input = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW);
  const output = await open(
    destination,
    constants.O_CREAT |
      constants.O_EXCL |
      constants.O_WRONLY |
      constants.O_NOFOLLOW,
    0o600,
  );
  const buffer = Buffer.allocUnsafe(64 * 1024);
  try {
    for (;;) {
      const { bytesRead } = await input.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      let offset = 0;
      while (offset < bytesRead) {
        const { bytesWritten } = await output.write(
          buffer,
          offset,
          bytesRead - offset,
          null,
        );
        if (bytesWritten === 0) throw new Error("Backup copy made no progress");
        offset += bytesWritten;
      }
    }
    await output.sync();
  } finally {
    await Promise.allSettled([input.close(), output.close()]);
  }
}

async function copyTree(
  sourceRoot: string,
  destinationRoot: string,
): Promise<void> {
  const sourceStat = await lstat(sourceRoot);
  if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink())
    throw new Error("Backup source tree is unsafe");
  await mkdir(destinationRoot, { mode: 0o700 });

  async function visit(
    sourceDirectory: string,
    destinationDirectory: string,
  ): Promise<void> {
    const entries = await readdir(sourceDirectory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const source = join(sourceDirectory, entry.name);
      const destination = join(destinationDirectory, entry.name);
      const stat = await lstat(source);
      if (stat.isSymbolicLink())
        throw new Error("Backup source tree is unsafe");
      if (stat.isDirectory()) {
        await mkdir(destination, { mode: 0o700 });
        await visit(source, destination);
      } else if (stat.isFile()) {
        await copyRegularFile(source, destination);
      } else {
        throw new Error("Backup source tree is unsafe");
      }
    }
  }
  await visit(sourceRoot, destinationRoot);
}

async function digestFile(
  path: string,
): Promise<{ digest: string; size: number }> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let size = 0;
  try {
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      size += bytesRead;
    }
  } finally {
    await handle.close();
  }
  return { digest: `sha256:${hash.digest("hex")}`, size };
}

async function digestTree(
  root: string,
): Promise<{ digest: string; size: number }> {
  const files: string[] = [];
  async function collect(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await collect(path);
      else if (entry.isFile()) files.push(path);
      else throw new Error("Prepared backup tree is unsafe");
    }
  }
  await collect(root);
  const tree = createHash("sha256");
  let size = 0;
  for (const path of files) {
    const file = await digestFile(path);
    size += file.size;
    tree.update(relative(root, path));
    tree.update("\0");
    tree.update(file.digest);
    tree.update("\n");
  }
  return { digest: `sha256:${tree.digest("hex")}`, size };
}

export async function prepareBackupGeneration(
  options: BackupGenerationOptions,
): Promise<PreparedBackupGeneration> {
  const [thoughtRoot, generationRoot] = await Promise.all([
    realpath(options.thoughtDataRoot),
    realpath(options.generationRoot),
  ]);
  const thoughtToGeneration = relative(thoughtRoot, generationRoot);
  const generationToThought = relative(generationRoot, thoughtRoot);
  const nested = (path: string): boolean =>
    path === "" ||
    (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
  if (nested(thoughtToGeneration) || nested(generationToThought)) {
    throw new Error("Backup source and destination roots overlap");
  }
  const generationId = (options.createGenerationId ?? randomUUID)();
  const generationPath = await resolveAbsentBackupDestination(
    generationRoot,
    generationId,
  );
  await mkdir(generationPath, { mode: 0o700 });
  const lifecyclePath = join(generationPath, "lifecycle.sqlite");
  const thoughtPath = join(generationPath, "thought-data");
  const createdAt = (options.now ?? (() => new Date()))().toISOString();
  try {
    await options.withWritesPaused(async () => {
      await options.lifecycleStore.backupTo(lifecyclePath);
      await copyTree(thoughtRoot, thoughtPath);
    });
    const [lifecycle, thoughts] = await Promise.all([
      digestFile(lifecyclePath),
      digestTree(thoughtPath),
    ]);
    const manifest = {
      format: "llmthink-backup-generation-v1",
      generation_id: generationId,
      created_at: createdAt,
      recovery_point_at: createdAt,
      producer_version: options.producerVersion,
      profile_id: options.profileId,
      components: [
        {
          kind: "lifecycle_sqlite",
          name: "lifecycle.sqlite",
          format_version: SQLITE_LIFECYCLE_SCHEMA_VERSION,
          byte_size: lifecycle.size,
          sha256: lifecycle.digest,
        },
        {
          kind: "thought_repository",
          name: "thought-data",
          format_version: 1,
          byte_size: thoughts.size,
          sha256: thoughts.digest,
        },
      ],
    } satisfies BackupGenerationManifest;
    const manifestHandle = await open(
      join(generationPath, "manifest.json"),
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await manifestHandle.writeFile(
        encodeBackupGenerationManifest(manifest),
        "utf8",
      );
      await manifestHandle.sync();
    } finally {
      await manifestHandle.close();
    }
    return { generationId, path: generationPath, manifest };
  } catch (error) {
    await rm(generationPath, { recursive: true, force: true });
    throw error;
  }
}
