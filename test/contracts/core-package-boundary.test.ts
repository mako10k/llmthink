import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const coreRoot = join(repoRoot, "packages", "core");
const coreSourceRoot = join(coreRoot, "src");

interface PackageManifest {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  exports?: Record<string, unknown>;
}

async function readManifest(path: string): Promise<PackageManifest> {
  return JSON.parse(await readFile(path, "utf8")) as PackageManifest;
}

async function typescriptFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) return typescriptFiles(path);
      return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
    }),
  );
  return nested.flat();
}

test("root application pins the exact Core workspace version", async () => {
  const root = await readManifest(join(repoRoot, "package.json"));
  const core = await readManifest(join(coreRoot, "package.json"));

  assert.equal(core.name, "@llmthink/core");
  assert.equal(root.dependencies?.[core.name], core.version);
  assert.ok(core.exports?.["."]);
  assert.equal(core.dependencies, undefined);
});

test("Core source cannot import application or adapter implementation", async () => {
  const imports = /\bfrom\s+["'](\.{1,2}\/[^"']+)["']/g;
  for (const file of await typescriptFiles(coreSourceRoot)) {
    const text = await readFile(file, "utf8");
    for (const match of text.matchAll(imports)) {
      const target = resolve(dirname(file), match[1]!);
      const location = relative(coreSourceRoot, target);
      assert.equal(
        location.startsWith(".."),
        false,
        `${relative(repoRoot, file)} escapes Core via ${match[1]}`,
      );
    }
  }
});

test("application source consumes Core through its package boundary", async () => {
  const removedSourceDirectories = [
    "analyzer",
    "config",
    "dsl",
    "dslql",
    "model",
    "parser",
    "semantic",
  ];
  for (const directory of removedSourceDirectories) {
    assert.equal(existsSync(join(repoRoot, "src", directory)), false);
  }

  const applicationFiles = await typescriptFiles(join(repoRoot, "src"));
  const forbiddenImport =
    /from\s+["']\.\.\/(?:analyzer|config|dsl|dslql|model|parser|semantic)\//;
  for (const file of applicationFiles) {
    const text = await readFile(file, "utf8");
    assert.doesNotMatch(text, forbiddenImport, relative(repoRoot, file));
  }

  const facade = await readFile(join(repoRoot, "src", "index.ts"), "utf8");
  assert.match(facade, /^export \* from "@llmthink\/core";/m);
});
