import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  verifyCandidateFiles,
  verifyContractPackage,
} from "@llmthink/contracts";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const contractsRoot = join(repoRoot, "packages", "contracts");

interface PackageManifest {
  readonly name: string;
  readonly version: string;
  readonly private?: boolean;
  readonly devDependencies?: Readonly<Record<string, string>>;
}

async function manifest(path: string): Promise<PackageManifest> {
  return JSON.parse(await readFile(path, "utf8")) as PackageManifest;
}

async function typescriptFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) => {
        const path = join(root, entry.name);
        if (entry.isDirectory()) return typescriptFiles(path);
        return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
      }),
    )
  ).flat();
}

test("root pins the exact private contracts workspace version", async () => {
  const root = await manifest(join(repoRoot, "package.json"));
  const contracts = await manifest(join(contractsRoot, "package.json"));
  assert.equal(contracts.name, "@llmthink/contracts");
  assert.equal(contracts.private, true);
  assert.equal(root.devDependencies?.[contracts.name], contracts.version);
});

test("contract package verifies without importing server implementation", async () => {
  const report = await verifyContractPackage(contractsRoot);
  assert.equal(report.tool_count, 11);
  for (const file of await typescriptFiles(join(contractsRoot, "src"))) {
    const text = await readFile(file, "utf8");
    assert.doesNotMatch(text, /src\/server|\.\.\/\.\.\/\.\.\/src/);
    const imports = /\bfrom\s+["'](\.{1,2}\/[^"']+)["']/g;
    for (const match of text.matchAll(imports)) {
      const target = resolve(dirname(file), match[1]!);
      assert.equal(
        relative(join(contractsRoot, "src"), target).startsWith(".."),
        false,
        `${relative(repoRoot, file)} escapes contracts source`,
      );
    }
  }
});

test("recorded producer and consumer snapshots conform exactly", async () => {
  const contractPath = join(contractsRoot, "contracts", "hosted-mcp-v1.json");
  for (const candidatePath of [
    join(
      contractsRoot,
      "fixtures",
      "producers",
      "llmthink-server-c205a7d.json",
    ),
    join(
      contractsRoot,
      "fixtures",
      "consumers",
      "llmthink-chatgpt-plugin-b480c84.json",
    ),
  ]) {
    await verifyCandidateFiles({ contractPath, candidatePath, exact: true });
  }
});
