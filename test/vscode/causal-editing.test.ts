// R: Verify contributed causal snippets and editor vocabulary against the real parser/audit.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { auditDslText, parseDocument } from "@mako10k/llmthink-core";

type Snippet = { prefix: string; body: string[] };
const snippetFile = "vscode-extension/snippets/causal-relations.code-snippets";
const parsed = ts.parseConfigFileTextToJson(
  snippetFile,
  readFileSync(snippetFile, "utf8"),
);
assert.equal(parsed.error, undefined);
const snippets = parsed.config as Record<string, Snippet>;
function defaults(snippet: Snippet): string {
  return snippet.body
    .join("\n")
    .replace(
      /\$\{\d+\|([^}]+)\|\}/g,
      (_match, choices: string) => choices.split(",")[0]!,
    )
    .replace(/\$\{\d+:([^}]+)\}/g, "$1")
    .replace(/\$\d+/g, "");
}

test("VSIX contributes parseable causal templates and unknown-cause analysis", async () => {
  const manifest = JSON.parse(
    readFileSync("vscode-extension/package.json", "utf8"),
  );
  assert.ok(
    manifest.contributes.snippets.some(
      (entry: { path: string }) =>
        entry.path === "./snippets/causal-relations.code-snippets",
    ),
  );
  const unknown = defaults(snippets["Unknown cause and containment"]!);
  const report = await auditDslText(unknown, "snippet", {
    embeddings: { provider: "none" },
  });
  assert.equal(report.summary.fatal_count, 0);
  assert.equal(report.summary.error_count, 0);
  assert.ok(report.results.some((r) => r.metadata?.rule_id === "CI006"));
  const causal = defaults(snippets["Causal reference detail"]!)
    .split("\n")
    .map((line) => "  " + line)
    .join("\n");
  const action = defaults(snippets["Action target detail"]!)
    .split("\n")
    .map((line) => "  " + line)
    .join("\n");
  const text =
    'premise CAUSE:\n  "candidate"\npremise TARGET:\n  "target"\ndecision M based_on CAUSE acts_on TARGET:\n  "action"\n' +
    causal +
    "\n" +
    action;
  assert.doesNotThrow(() => parseDocument(text));
  assert.equal(
    (
      await auditDslText(text, "fragments", {
        embeddings: { provider: "none" },
      })
    ).summary.error_count,
    0,
  );
});

test("TextMate classifies relation kind and status values", () => {
  const grammar = JSON.parse(
    readFileSync("vscode-extension/syntaxes/llmthink.tmLanguage.json", "utf8"),
  );
  const patterns = grammar.repository.keywords.patterns as Array<{
    name: string;
    match: string;
  }>;
  for (const [scope, text] of [
    ["constant.language.relation-kind.llmthink", "kind mitigation"],
    ["constant.language.relation-status.llmthink", "status hypothesis"],
  ]) {
    const pattern = patterns.find((entry) => entry.name === scope);
    assert.ok(pattern);
    assert.ok(new RegExp(pattern.match).test(text));
  }
});
