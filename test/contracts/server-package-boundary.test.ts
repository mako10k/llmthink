import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const contractsRoot = join(repoRoot, "packages", "contracts");
const serverRoot = join(repoRoot, "packages", "server");

interface PackageManifest {
  readonly name: string;
  readonly version: string;
  readonly private?: boolean;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly files?: readonly string[];
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

test("root and server pin exact workspace dependency versions", async () => {
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
  assert.equal(root.dependencies?.[server.name], server.version);
  assert.equal(contracts.dependencies?.[core.name], core.version);
  assert.equal(server.dependencies?.[core.name], core.version);
  assert.equal(server.dependencies?.[contracts.name], contracts.version);
  assert.ok(root.files?.includes("!dist/server/backup"));
});

test("Contracts owns shared Hosted API declarations and Server consumes them", async () => {
  const hostedApi = await readFile(
    join(contractsRoot, "src", "hosted-api.ts"),
    "utf8",
  );
  const serverContracts = await readFile(
    join(serverRoot, "src", "contracts.ts"),
    "utf8",
  );
  assert.match(serverContracts, /from "@llmthink\/contracts"/);

  for (const symbol of [
    "LLMTHINK_SERVER_API_VERSION",
    "LLMTHINK_SERVER_SCOPES",
    "LLMTHINK_SERVER_ERROR_CODES",
    "CommandIdentity",
    "RevisionPrecondition",
    "ThoughtRef",
    "ServerThoughtSnapshot",
    "CreateThoughtCommand",
    "SaveDraftCommand",
    "RecordAuditCommand",
    "FinalizeThoughtCommand",
    "AddReflectionCommand",
    "DeleteThoughtCommand",
    "ThoughtDeletionReceipt",
    "ThoughtListQuery",
    "ThoughtSearchQuery",
    "ThoughtPage",
  ]) {
    const declaration = new RegExp(
      `export (?:const|interface|type) ${symbol}\\b`,
    );
    assert.match(
      hostedApi,
      declaration,
      `${symbol} must be owned by Contracts`,
    );
    assert.doesNotMatch(
      serverContracts,
      declaration,
      `${symbol} must not be redeclared by Server`,
    );
  }
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

test("root keeps only the hosted-main compatibility facade", async () => {
  const files = await readdir(join(repoRoot, "src", "server"));
  assert.deepEqual(files, ["hosted-main.ts"]);
  const facade = await readFile(
    join(repoRoot, "src", "server", "hosted-main.ts"),
    "utf8",
  );
  assert.match(facade, /@llmthink\/server\/hosted-main/);
  const rootIndex = await readFile(join(repoRoot, "src", "index.ts"), "utf8");
  assert.match(rootIndex, /from "@llmthink\/server"/);
  assert.doesNotMatch(rootIndex, /from "\.\/server\//);

  const allowed = new Set(["index.ts", "server/hosted-main.ts"]);
  for (const file of await typescriptFiles(join(repoRoot, "src"))) {
    const relativePath = relative(join(repoRoot, "src"), file);
    if (allowed.has(relativePath)) continue;
    assert.doesNotMatch(
      await readFile(file, "utf8"),
      /@llmthink\/server/,
      `${relativePath} imports the Hosted server outside compatibility code`,
    );
  }
});
