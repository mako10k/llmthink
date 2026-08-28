import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const serverRoot = join(repoRoot, "packages", "server");

interface PackageManifest {
  readonly name: string;
  readonly version: string;
  readonly private?: boolean;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly bin?: Readonly<Record<string, string>>;
  readonly files?: readonly string[];
  readonly scripts?: Readonly<Record<string, string>>;
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

test("root excludes Hosted server while server pins exact dependencies", async () => {
  const root = await manifest(join(repoRoot, "package.json"));
  const core = await manifest(
    join(repoRoot, "packages", "core", "package.json"),
  );
  const contracts = await manifest(
    join(repoRoot, "packages", "contracts", "package.json"),
  );
  const server = await manifest(join(serverRoot, "package.json"));
  assert.equal(server.name, "@llmthink/server");
  assert.equal(server.private, true);
  assert.equal(root.dependencies?.[server.name], undefined);
  assert.equal(root.bin?.["llmthink-hosted-mcp"], undefined);
  assert.equal(server.dependencies?.[core.name], core.version);
  assert.equal(server.dependencies?.[contracts.name], contracts.version);
  assert.ok(root.files?.includes("!dist/server"));
  assert.doesNotMatch(root.scripts?.["test:app"] ?? "", /server/);
  assert.doesNotMatch(root.scripts?.["typecheck:app"] ?? "", /server/);
  assert.doesNotMatch(root.scripts?.prepack ?? "", /server/);
});

test("server source cannot import root application or adapter implementation", async () => {
  const sourceRoot = join(serverRoot, "src");
  for (const file of await typescriptFiles(sourceRoot)) {
    const text = await readFile(file, "utf8");
    assert.doesNotMatch(text, /src\/(thought|server|lsp|mcp)|vscode-extension/);
    const imports = /\bfrom\s+["'](\.{1,2}\/[^"']+)["']/g;
    for (const match of text.matchAll(imports)) {
      const target = resolve(dirname(file), match[1]!);
      assert.equal(
        relative(sourceRoot, target).startsWith(".."),
        false,
        `${relative(repoRoot, file)} escapes server source`,
      );
    }
  }
});

test("root source has no Hosted server facade or public re-export", async () => {
  assert.equal(existsSync(join(repoRoot, "src", "server")), false);
  const rootIndex = await readFile(join(repoRoot, "src", "index.ts"), "utf8");
  assert.doesNotMatch(rootIndex, /@llmthink\/server/);
  assert.doesNotMatch(rootIndex, /from "\.\/server\//);
});
