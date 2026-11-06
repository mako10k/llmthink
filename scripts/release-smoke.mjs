// R: Verify candidate tarballs through an isolated npm install without publishing.
import assert from "node:assert/strict";
import process from "node:process";
import console from "node:console";
import { Buffer } from "node:buffer";
const { fetch } = globalThis;
import { createServer } from "node:http";
import { readFile, writeFile, mkdtemp, access } from "node:fs/promises";
import { execFileSync, spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const artifactDir = resolve(process.argv[2] ?? "");
const records = JSON.parse(
  await readFile(join(artifactDir, "npm-pack.json"), "utf8"),
);
const packages = new Map(
  records.map((record) => {
    const manifest = JSON.parse(
      execFileSync(
        "/usr/bin/tar",
        ["-xOf", join(artifactDir, record.filename), "package/package.json"],
        { encoding: "utf8" },
      ),
    );
    assert.equal(manifest.private, undefined);
    return [record.name, { record, manifest }];
  }),
);
assert.ok(
  !packages
    .get("llmthink")
    .record.files.some((file) => file.path.startsWith("dist/config/")),
  "Root tarball contains orphaned pre-Core config output",
);
let baseUrl;
async function serve(req, res) {
  const path = decodeURIComponent(req.url.split("?")[0].slice(1));
  const candidate = packages.get(path);
  if (candidate) {
    const { record, manifest } = candidate;
    const version = {
      ...manifest,
      dist: {
        tarball: baseUrl + "/tarballs/" + record.filename,
        integrity: record.integrity,
        shasum: record.shasum,
      },
    };
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        name: record.name,
        "dist-tags": { latest: record.version },
        versions: { [record.version]: version },
      }),
    );
    return;
  }
  const tarball = records.find((r) => path === "tarballs/" + r.filename);
  if (tarball) {
    res.end(await readFile(join(artifactDir, tarball.filename)));
    return;
  }
  // Only the disposable test registry proxies public dependency reads. No credentials forwarded.
  const upstream = await fetch("https://registry.npmjs.org" + req.url);
  res.statusCode = upstream.status;
  res.setHeader(
    "content-type",
    upstream.headers.get("content-type") ?? "application/octet-stream",
  );
  res.end(Buffer.from(await upstream.arrayBuffer()));
}
const server = createServer((req, res) => {
  serve(req, res).catch((error) => {
    res.statusCode = 500;
    res.end(String(error));
  });
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
baseUrl = "http://127.0.0.1:" + server.address().port;
const fixture = await mkdtemp(join(tmpdir(), "llmthink-release-install-"));
const env = { ...process.env };
delete env.NPM_TOKEN;
delete env.NODE_AUTH_TOKEN;
function run(command, args) {
  return new Promise((done, reject) => {
    const child = spawn(command, args, {
      cwd: fixture,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "",
      errors = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      errors += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? done(output) : reject(new Error(errors + output)),
    );
  });
}
try {
  await writeFile(
    join(fixture, "package.json"),
    '{"name":"release-install-smoke","private":true}',
  );
  await writeFile(join(fixture, "npmrc"), "");
  await writeFile(join(fixture, "globalnpmrc"), "");
  await run("npm", [
    "install",
    "llmthink@1.4.0",
    "--registry",
    baseUrl,
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--cache",
    join(artifactDir, "npm-cache"),
    "--userconfig",
    join(fixture, "npmrc"),
    "--globalconfig",
    join(fixture, "globalnpmrc"),
  ]);
  for (const [name, { manifest }] of packages) {
    const installed = JSON.parse(
      await readFile(
        join(fixture, "node_modules", name, "package.json"),
        "utf8",
      ),
    );
    assert.equal(installed.version, manifest.version);
  }
  const imported = await run(process.execPath, [
    "--input-type=module",
    "-e",
    'import * as api from "llmthink"; const r = await api.auditDslText("problem P:\\n  \\"release\\"", "release", {embeddings:{provider:"none"}}); if(r.package_version!=="1.4.0" || typeof api.LlmthinkApplicationService!=="function") process.exit(1);',
  ]);
  await run(process.execPath, [
    "--input-type=module",
    "-e",
    'import {verifyContractPackage} from "@mako10k/llmthink-contracts"; const r = await verifyContractPackage("node_modules/@mako10k/llmthink-contracts"); if(r.package_version!=="1.4.0") process.exit(1);',
  ]);
  const cli = join(fixture, "node_modules/.bin/llmthink");
  const text =
    'problem P:\n  "release"\ndecision M based_on P acts_on P:\n  "action"\n  relation acts_on P:\n    kind intervention\n    mechanism "change"\n';
  const checked = JSON.parse(
    await run(process.execPath, [cli, "dsl", "check", "--text", text]),
  );
  assert.equal(checked.failed, false);
  assert.equal(checked.persisted, false);
  for (const path of Object.values(packages.get("llmthink").manifest.bin)) {
    await access(join(fixture, "node_modules/llmthink", path));
  }
  const help = await run(process.execPath, [
    cli,
    "dsl",
    "help",
    "samples",
    "causal-impact-unknown",
    "detail",
  ]);
  const samplesResolvable = !help.includes("resolved_path: unavailable");
  for (const [topic, subtopic, detail, tokens] of [
    [
      "syntax",
      "decision",
      "quick",
      ["acts_on", "relation", "causal-impact-unknown"],
    ],
    [
      "usecases",
      "problem-solving",
      "quick",
      ["acts_on", "causal-impact-unknown"],
    ],
    ["query", "roots", "detail", [".acts_on?", ".relations?[]", "target_id"]],
  ]) {
    const output = await run(process.execPath, [
      cli,
      "dsl",
      "help",
      topic,
      subtopic,
      detail,
    ]);
    for (const token of tokens)
      assert.ok(output.includes(token), `Missing help: ${token}`);
  }

  const result = {
    candidate_registry_is_fixture: true,
    installed_root_only: true,
    installed_versions: [...packages.keys()].map((name) => [
      name,
      packages.get(name).manifest.version,
    ]),
    root_exports_verified: true,
    cli_verified: true,
    bin_files_verified: true,
    samples_resolvable: samplesResolvable,
    updated_help_verified: true,
    fixture,
    imported,
  };
  await writeFile(
    join(artifactDir, "install-smoke.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
  assert.ok(
    samplesResolvable,
    "Installed CLI cannot resolve its bundled sample catalog",
  );
} finally {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
