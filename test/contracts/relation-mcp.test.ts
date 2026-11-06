// R: Verify relation findings through the distributed stdio MCP tool.
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { auditDslText, type AuditReport } from "@mako10k/llmthink-core";

test(
  "stdio MCP shares Core relation findings and preserves explicit unknown causes",
  { timeout: 15_000 },
  async (t) => {
    const root = mkdtempSync(join(tmpdir(), "llmthink-relation-mcp-"));
    const client = new Client({ name: "relation-conformance", version: "1" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(process.cwd(), "dist/mcp/server.js")],
      cwd: root,
      stderr: "pipe",
    });
    t.after(async () => {
      await client.close();
      rmSync(root, { recursive: true, force: true });
    });
    await client.connect(transport);
    const text = readFileSync(
      "docs/examples/causal-impact-unknown.think",
      "utf8",
    );
    const expected = await auditDslText(text, "relations", {
      embeddings: { provider: "none" },
    });
    const result = await client.callTool({
      name: "dsl",
      arguments: { action: "audit", dslText: text, documentId: "relations" },
    });
    const blocks = result.content as Array<{ type: string; text?: string }>;
    const json = blocks.find(
      (block) =>
        block.type === "text" && block.text?.trimStart().startsWith("{"),
    );
    assert.ok(json?.text);
    const report = (JSON.parse(json.text) as { report: AuditReport }).report;
    const normalize = (value: AuditReport) =>
      value.results
        .filter((r) => r.metadata?.rule_id)
        .map((r) => [
          r.metadata?.rule_id,
          r.severity,
          r.target_refs,
          r.message,
          r.metadata?.line,
        ]);
    assert.deepEqual(normalize(report), normalize(expected));
  },
);
