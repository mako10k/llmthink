// R: Check relation audit parity and source preservation at public consumer boundaries.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  auditDslText,
  draftThought,
  loadThought,
  parseDocument,
  formatDocument,
  LlmthinkApplicationService,
  ServerFileThoughtRepository,
} from "../../src/index.ts";

const text = readFileSync("docs/examples/causal-impact-unknown.think", "utf8");
const findings = (report: Awaited<ReturnType<typeof auditDslText>>) =>
  report.results
    .filter((r) => r.metadata?.rule_id)
    .map((r) => ({
      rule: r.metadata?.rule_id,
      severity: r.severity,
      refs: r.target_refs,
      line: r.metadata?.line,
      message: r.message,
    }));

test("Core, distributed CLI and hosted application expose identical profile findings", async () => {
  const root = mkdtempSync(join(tmpdir(), "llmthink-relation-parity-"));
  try {
    const expected = findings(
      await auditDslText(text, "parity", { embeddings: { provider: "none" } }),
    );
    const cli = spawnSync(
      process.execPath,
      [
        "dist/cli.js",
        "dsl",
        "check",
        "--text",
        text,
        "--id",
        "parity",
        "--storage-path",
        join(root, "unused"),
      ],
      {
        encoding: "utf8",
        env: { ...process.env, LLMTHINK_EMBEDDING_PROVIDER: "none" },
      },
    );
    assert.equal(cli.status, 0, cli.stderr);
    const checked = JSON.parse(cli.stdout);
    assert.equal(checked.persisted, false);
    assert.deepEqual(findings(checked.documents[0].report), expected);
    const app = new LlmthinkApplicationService({
      repository: new ServerFileThoughtRepository({ dataRoot: root }),
    });
    const hosted = await app.audit(
      { text, documentId: "parity" },
      {
        subjectId: "test",
        tenantId: "test",
        workspaceId: "test",
        scopes: ["audit:run"],
        requestId: "relations",
      },
    );
    assert.equal(hosted.persisted, false);
    assert.deepEqual(findings(hosted.report), expected);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stored source reload and canonical formatting preserve all authored relation data", () => {
  const root = mkdtempSync(join(tmpdir(), "llmthink-relation-store-"));
  try {
    draftThought("relations", text, { storageRoot: root });
    const restored = loadThought("relations", { storageRoot: root }).draftText;
    assert.equal(restored, text);
    assert.equal(
      formatDocument(parseDocument(restored!)),
      formatDocument(parseDocument(text)),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("preview renders outgoing action targets separately from incoming causal support", async () => {
  const root = mkdtempSync(join(tmpdir(), "llmthink-relation-preview-"));
  const output = join(root, "preview.html");
  const rendered = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "vscode-extension/src/render-preview-html.ts",
      "docs/examples/causal-impact-unknown.think",
      "--out",
      output,
      "--locale",
      "ja",
    ],
    { encoding: "utf8" },
  );
  assert.equal(rendered.status, 0, rendered.stderr);
  let html: string;
  try {
    html = readFileSync(output, "utf8");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  assert.match(
    html,
    /data-edge-from="M1" data-edge-to="S1" data-edge-kind="mitigation"/,
  );
  assert.match(
    html,
    /data-edge-from="C1" data-edge-to="S1" data-edge-kind="causal"/,
  );
  assert.match(html, /edge-action/);
  assert.match(html, /mechanism/);
});
