// R: Verify existing public exports and deferred SQLite loading at consumer entrypoints.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const baseline = JSON.parse(
  readFileSync("test/fixtures/public-api-1.4.0.json", "utf8"),
) as { root: string[]; server: string[]; rootBin: object; serverBin: object };

test("public root and Server imports preserve 1.4.0 exports without loading SQLite", () => {
  const fixture = mkdtempSync(join(tmpdir(), "llmthink-runtime-import-"));
  try {
    writeFileSync(
      join(fixture, "loader.mjs"),
      `
export function resolve(specifier, context, next) {
  if (specifier === "node:sqlite") throw new Error("Unexpected eager SQLite import");
  return next(specifier, context);
}
`,
    );
    writeFileSync(
      join(fixture, "bootstrap.mjs"),
      `
import { register, createRequire } from "node:module";
register(new URL("./loader.mjs", import.meta.url));
const Module = createRequire(import.meta.url)("node:module");
const load = Module._load;
Module._load = function(specifier, ...args) {
  if (specifier === "node:sqlite") throw new Error("Unexpected eager SQLite require");
  return load.call(this, specifier, ...args);
};
`,
    );
    const rootUrl = pathToFileURL(resolve("dist/index.js")).href;
    const serverUrl = pathToFileURL(
      resolve("packages/server/dist/index.js"),
    ).href;
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        join(fixture, "bootstrap.mjs"),
        "--input-type=module",
        "-e",
        `const root = await import(${JSON.stringify(rootUrl)});
const server = await import(${JSON.stringify(serverUrl)});
if (Number(process.versions.node.split(".")[0]) === 22) {
  let error;
  try { new server.SqliteLifecycleStore({path: ":memory:", allowMemory: true}); }
  catch (caught) { error = caught; }
  if (!error?.message.includes("SQLite lifecycle requires Node.js >=24.15.0 and <25.0.0"))
    throw new Error("Existing SQLite runtime guard changed or driver loaded too early");
}
console.log(JSON.stringify({root: Object.keys(root), server: Object.keys(server)}));`,
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    const current = JSON.parse(result.stdout) as {
      root: string[];
      server: string[];
    };
    for (const group of ["root", "server"] as const) {
      for (const name of baseline[group])
        assert.ok(current[group].includes(name), `${group}.${name}`);
    }
    assert.deepEqual(
      JSON.parse(readFileSync("package.json", "utf8")).bin,
      baseline.rootBin,
    );
    assert.deepEqual(
      JSON.parse(readFileSync("packages/server/package.json", "utf8")).bin,
      baseline.serverBin,
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
