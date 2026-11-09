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
import { createRequire } from "node:module";
import { constants } from "node:fs";
import { setTimeout, clearTimeout } from "node:timers";

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
const releaseVersion = packages.get("llmthink").manifest.version;
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
async function verifyHostedBins() {
  for (const name of ["llmthink", "@mako10k/llmthink-server"]) {
    const probe = createServer();
    await new Promise((done) => probe.listen(0, "127.0.0.1", done));
    const port = probe.address().port;
    await new Promise((done, reject) =>
      probe.close((error) => (error ? reject(error) : done())),
    );
    const entry = join(
      fixture,
      "node_modules",
      name,
      packages.get(name).manifest.bin["llmthink-hosted-mcp"],
    );
    const child = spawn(process.execPath, [entry], {
      cwd: fixture,
      env: {
        ...env,
        LLMTHINK_HOSTED_HOST: "127.0.0.1",
        LLMTHINK_HOSTED_PORT: String(port),
        LLMTHINK_HOSTED_DATA_ROOT: join(fixture, name.replaceAll("/", "-")),
        LLMTHINK_HOSTED_BEARER_TOKEN:
          "isolated-runtime-test-token-longer-than-32-bytes",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const exited = new Promise((done) => child.once("exit", done));
    let output = "",
      errors = "",
      timer;
    try {
      await new Promise((done, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Hosted startup timed out: ${errors}`)),
          10_000,
        );
        child.stdout.on("data", (chunk) => {
          output += chunk;
          if (output.includes("hosted MCP listening")) done();
        });
        child.stderr.on("data", (chunk) => {
          errors += chunk;
        });
        child.once("error", reject);
        child.once("exit", (code) =>
          reject(new Error(`Hosted exited ${code}: ${errors}`)),
        );
      });
      const response = await fetch(`http://127.0.0.1:${port}/`);
      assert.equal(response.status, 404);
      await response.text();
    } finally {
      clearTimeout(timer);
      child.kill();
      await exited;
    }
  }
}

async function verifyClientProtocols() {
  const require = createRequire(join(fixture, "package.json"));
  const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
  const {
    StdioClientTransport,
  } = require("@modelcontextprotocol/sdk/client/stdio.js");
  const client = new Client({ name: "candidate-runtime-check", version: "1" });
  try {
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [join(fixture, "node_modules/.bin/llmthink-mcp")],
        cwd: fixture,
        env,
        stderr: "pipe",
      }),
    );
    assert.equal(client.getServerVersion().version, releaseVersion);
    const help = await client.callTool({
      name: "dsl",
      arguments: {
        action: "help",
        topic: "syntax",
        subtopic: "decision",
        detail: "quick",
      },
    });
    assert.ok(JSON.stringify(help).includes("acts_on"));
  } finally {
    await client.close();
  }

  const {
    createMessageConnection,
    StreamMessageReader,
    StreamMessageWriter,
  } = require("vscode-languageserver/node.js");
  const child = spawn(
    process.execPath,
    [join(fixture, "node_modules/.bin/llmthink-lsp"), "--stdio"],
    { cwd: fixture, env, stdio: ["pipe", "pipe", "pipe"] },
  );
  const connection = createMessageConnection(
    new StreamMessageReader(child.stdout),
    new StreamMessageWriter(child.stdin),
  );
  connection.listen();
  try {
    await connection.sendRequest("initialize", {
      processId: process.pid,
      rootUri: null,
      capabilities: {},
    });
    await connection.sendNotification("initialized", {});
    const uri = "file:///tmp/candidate-runtime.think";
    const text =
      'evidence C:\n  "observed"\ndecision M based_on C acts_on C:\n  "action"\n  relation acts_on C:\n    kind mitigation\n    mechanism "reduce"\n';
    await connection.sendNotification("textDocument/didOpen", {
      textDocument: { uri, languageId: "llmthink", version: 1, text },
    });
    const items = await connection.sendRequest("textDocument/completion", {
      textDocument: { uri },
      position: { line: 5, character: 9 },
    });
    assert.deepEqual(
      items.map((item) => item.label),
      ["intervention", "mitigation", "recovery"],
    );
    const definition = await connection.sendRequest("textDocument/definition", {
      textDocument: { uri },
      position: { line: 2, character: 31 },
    });
    assert.equal(definition.range.start.line, 0);
    await connection.sendRequest("shutdown");
    await connection.sendNotification("exit");
  } finally {
    connection.dispose();
    child.kill();
  }
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
    `llmthink@${releaseVersion}`,
    "--registry",
    baseUrl,
    "--ignore-scripts",
    "--engine-strict",
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
    'import * as api from "llmthink"; const r = await api.auditDslText("problem P:\\n  \\"release\\"", "release", {embeddings:{provider:"none"}}); if(r.package_version!==process.argv[1] || typeof api.LlmthinkApplicationService!=="function") process.exit(1); const server = await import("@mako10k/llmthink-server"); console.log(JSON.stringify({root: Object.keys(api), server: Object.keys(server)}));',
    releaseVersion,
  ]);
  await run(process.execPath, [
    "--input-type=module",
    "-e",
    'import {verifyContractPackage} from "@mako10k/llmthink-contracts"; const r = await verifyContractPackage("node_modules/@mako10k/llmthink-contracts"); if(r.package_version!==process.argv[1]) process.exit(1);',
    releaseVersion,
  ]);
  const cli = join(fixture, "node_modules/.bin/llmthink");
  const text =
    'problem P:\n  "release"\ndecision M based_on P acts_on P:\n  "action"\n  relation acts_on P:\n    kind intervention\n    mechanism "change"\n';
  const checked = JSON.parse(await run(cli, ["dsl", "check", "--text", text]));
  assert.equal(checked.failed, false);
  assert.equal(checked.persisted, false);
  for (const [command, path] of Object.entries(
    packages.get("llmthink").manifest.bin,
  )) {
    await access(join(fixture, "node_modules/llmthink", path));
    await access(join(fixture, "node_modules/.bin", command), constants.X_OK);
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

  await verifyClientProtocols();
  await verifyHostedBins();
  const result = {
    node_version: process.versions.node,
    engine_strict: true,
    candidate_registry_is_fixture: true,
    installed_root_only: true,
    installed_versions: [...packages.keys()].map((name) => [
      name,
      packages.get(name).manifest.version,
    ]),
    root_exports_verified: true,
    public_api_exports: JSON.parse(imported),
    stdio_mcp_verified: true,
    lsp_verified: true,
    hosted_bins_verified: true,
    cli_verified: true,
    bin_files_verified: true,
    samples_resolvable: samplesResolvable,
    updated_help_verified: true,
    fixture,
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
