import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const distCli = resolve(repoRoot, "dist/cli.js");
const relativeImportPattern = /(?:from\s+|import\s*\()["'](\.[^"']+)["']/g;

function reachableRelativeModules(entrypoint: string): string[] {
  const pending = [entrypoint];
  const visited = new Set<string>();

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    const source = readFileSync(current, "utf8");
    for (const match of source.matchAll(relativeImportPattern)) {
      const specifier = match[1];
      if (!specifier) continue;
      const dependency = resolve(dirname(current), specifier);
      assert.equal(
        existsSync(dependency),
        true,
        `${relative(repoRoot, current)} imports missing ${relative(repoRoot, dependency)}`,
      );
      pending.push(dependency);
    }
  }

  return [...visited].sort();
}

test("distributed CLI runtime modules are present and tracked", () => {
  for (const modulePath of reachableRelativeModules(distCli)) {
    const repositoryPath = relative(repoRoot, modulePath);
    const tracked = spawnSync(
      "/usr/bin/git",
      ["ls-files", "--error-unmatch", "--", repositoryPath],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.equal(tracked.status, 0, `${repositoryPath} is not tracked`);
  }
});

test("distributed CLI executes non-persistent dsl check", () => {
  const result = spawnSync(
    process.execPath,
    [
      distCli,
      "dsl",
      "check",
      "--text",
      'problem P1:\n  "Check the distributed CLI"\n',
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout) as {
    persisted: boolean;
    source_count: number;
  };
  assert.equal(output.persisted, false);
  assert.equal(output.source_count, 1);
});
