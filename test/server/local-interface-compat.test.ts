import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  LlmthinkApplicationService,
  ServerFileThoughtRepository,
  draftThought,
  loadThought,
  type RequestContext,
} from "../../src/index.js";

const executeFile = promisify(execFile);
const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const CONTEXT: RequestContext = {
  subjectId: "user-1",
  tenantId: "tenant-1",
  workspaceId: "workspace-1",
  scopes: ["thought:read", "thought:write"],
  requestId: "local-parity-1",
};

test("CLI pure audit remains a local process with no hosted server", async () => {
  const { stdout } = await executeFile(
    process.execPath,
    [
      "--import",
      "tsx",
      "src/cli.ts",
      "dsl",
      "audit",
      "--text",
      'problem P1:\n  "local question"',
      "--id",
      "local-document",
    ],
    { cwd: repoRoot, timeout: 10_000 },
  );
  const output = JSON.parse(stdout) as {
    thought_id: string;
    report: { document_id: string };
  };
  assert.equal(output.thought_id, "local-document");
  assert.equal(output.report.document_id, "local-document");
});

test("stdio MCP initializes locally and preserves the dsl and thought tools", async (t) => {
  const { spawn } = await import("node:child_process");
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "src/mcp/server.ts"],
    { cwd: repoRoot, stdio: ["pipe", "pipe", "pipe"] },
  );
  t.after(() => child.kill("SIGTERM"));
  let buffer = "";
  const responses = new Map<number, (value: Record<string, unknown>) => void>();
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const message = JSON.parse(line) as { id?: number };
      if (message.id !== undefined) {
        responses.get(message.id)?.(message as Record<string, unknown>);
        responses.delete(message.id);
      }
    }
  });
  const request = async (
    id: number,
    method: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> => {
    const response = new Promise<Record<string, unknown>>((resolve, reject) => {
      responses.set(id, resolve);
      setTimeout(
        () => reject(new Error(`stdio MCP timeout for ${method}`)),
        5_000,
      ).unref();
    });
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`,
    );
    return response;
  };
  const initialized = await request(1, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "compat-test", version: "1" },
  });
  assert.equal(
    (initialized.result as { serverInfo: { name: string } }).serverInfo.name,
    "llmthink",
  );
  child.stdin.write(
    `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
  );
  const listed = await request(2, "tools/list", {});
  const tools = (listed.result as { tools: Array<{ name: string }> }).tools;
  assert.deepEqual(
    tools.map((tool) => tool.name),
    ["dsl", "thought"],
  );
});

test("local adapters do not loop back through hosted HTTP or MCP", async () => {
  for (const relativePath of [
    "src/cli.ts",
    "src/mcp/server.ts",
    "src/lsp/server.ts",
    "vscode-extension/src/extension.ts",
  ]) {
    const source = await readFile(join(repoRoot, relativePath), "utf8");
    assert.equal(source.includes("server/http"), false, relativePath);
    assert.equal(source.includes("server/hosted-mcp"), false, relativePath);
    assert.equal(source.includes("fetch("), false, relativePath);
  }
});

test("local and hosted stores retain distinct authority and layout contracts", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "llmthink-local-hosted-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const localRoot = join(root, "local");
  const hostedRoot = join(root, "hosted");
  draftThought("same-id", "local draft", { storageRoot: localRoot });
  const application = new LlmthinkApplicationService({
    repository: new ServerFileThoughtRepository({ dataRoot: hostedRoot }),
  });
  await application.createThought(
    {
      thoughtId: "same-id",
      draftText: "hosted draft",
      identity: {
        idempotencyKey: "create-1",
        requestDigest: `sha256:${"a".repeat(64)}`,
      },
    },
    CONTEXT,
  );

  assert.equal(
    loadThought("same-id", { storageRoot: localRoot }).draftText,
    "local draft",
  );
  assert.equal(
    (
      await application.getThought(
        {
          tenantId: CONTEXT.tenantId,
          workspaceId: CONTEXT.workspaceId,
          thoughtId: "same-id",
        },
        CONTEXT,
      )
    ).draftText,
    "hosted draft",
  );
  assert.equal(
    existsSync(join(localRoot, "thoughts", "same-id", "thought.json")),
    true,
  );
  assert.equal(
    existsSync(
      join(
        hostedRoot,
        "tenants",
        CONTEXT.tenantId,
        "workspaces",
        CONTEXT.workspaceId,
        "thoughts",
        "same-id",
        "CURRENT",
      ),
    ),
    true,
  );
  assert.equal(existsSync(join(localRoot, "tenants")), false);
  assert.equal(existsSync(join(hostedRoot, "thoughts")), false);
});
