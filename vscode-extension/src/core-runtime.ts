import { access, stat } from "node:fs/promises";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import * as bundledCore from "./core-bundled";

type CoreModule = typeof bundledCore;

const moduleCache = new Map<string, Promise<CoreModule>>();

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function candidateDirs(baseDir?: string): string[] {
  const startDir = path.resolve(baseDir ?? process.cwd());
  const dirs: string[] = [];
  let current = startDir;

  while (!dirs.includes(current)) {
    dirs.push(current);
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return dirs;
}

async function tryLoadWorkspaceCore(candidatePath: string): Promise<CoreModule | undefined> {
  if (!(await fileExists(candidatePath))) {
    return undefined;
  }

  const metadata = await stat(candidatePath);
  const cacheKey = `${candidatePath}:${metadata.mtimeMs}`;
  const cachedModule = moduleCache.get(cacheKey);
  if (cachedModule) {
    return cachedModule;
  }

  const loadedModule = import(
    `${pathToFileURL(candidatePath).href}?mtime=${metadata.mtimeMs}`
  ) as Promise<CoreModule>;
  moduleCache.set(cacheKey, loadedModule);
  return loadedModule;
}

export async function loadLlmthinkCore(baseDir?: string): Promise<CoreModule> {
  for (const dir of candidateDirs(baseDir)) {
    const candidate = path.join(dir, "dist", "index.js");
    const loadedModule = await tryLoadWorkspaceCore(candidate);
    if (loadedModule) {
      return loadedModule;
    }
  }

  return bundledCore;
}