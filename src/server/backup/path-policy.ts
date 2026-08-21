import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { BackupContractError } from "./contracts.js";

function fail(): never {
  throw new BackupContractError("unsafe_path");
}

function assertRelativeName(name: string): void {
  if (
    name.length === 0 ||
    name.includes("\0") ||
    isAbsolute(name) ||
    name
      .split(/[\\/]/u)
      .some((part) => part === "" || part === "." || part === "..")
  )
    fail();
}

function inside(root: string, candidate: string): boolean {
  const child = relative(root, candidate);
  return (
    child !== "" &&
    child !== ".." &&
    !child.startsWith(`..${sep}`) &&
    !isAbsolute(child)
  );
}

async function validatedRoot(root: string): Promise<string> {
  if (!isAbsolute(root)) fail();
  const rootStat = await lstat(root).catch(fail);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail();
  return realpath(root).catch(fail);
}

export async function resolveExistingBackupSource(
  sourceRoot: string,
  relativeName: string,
): Promise<string> {
  assertRelativeName(relativeName);
  const root = await validatedRoot(sourceRoot);
  const candidate = resolve(root, relativeName);
  if (!inside(root, candidate)) fail();
  let current = root;
  const parts = relative(root, candidate).split(sep);
  for (const [index, part] of parts.entries()) {
    current = resolve(current, part);
    const entry = await lstat(current).catch(fail);
    if (entry.isSymbolicLink()) fail();
    const last = index === parts.length - 1;
    if ((!last && !entry.isDirectory()) || (last && !entry.isFile())) fail();
  }
  if ((await realpath(candidate).catch(fail)) !== candidate) fail();
  return candidate;
}

export async function resolveAbsentBackupDestination(
  destinationRoot: string,
  relativeName: string,
): Promise<string> {
  assertRelativeName(relativeName);
  const root = await validatedRoot(destinationRoot);
  const candidate = resolve(root, relativeName);
  if (!inside(root, candidate)) fail();
  const parts = relative(root, candidate).split(sep);
  let current = root;
  for (const [index, part] of parts.entries()) {
    current = resolve(current, part);
    try {
      const entry = await lstat(current);
      if (
        entry.isSymbolicLink() ||
        index === parts.length - 1 ||
        !entry.isDirectory()
      )
        fail();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      if (index !== parts.length - 1) fail();
    }
  }
  return candidate;
}
