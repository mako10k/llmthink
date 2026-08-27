import assert from "node:assert/strict";
import test from "node:test";

import { auditDslText } from "../../src/index.ts";
import { deterministicSemanticEmbedder } from "../support/semantic-embedder.ts";

const SOURCE = `
problem P_COST:
  "運用コストを抑える"

step S1:
  decision D_COST based_on P_COST:
    "安価な構成で運用コストを下げる"

step S2:
  decision D_SPEED based_on P_COST:
    "応答速度を最優先する"

query Q1:
  .document.steps[].statement | select(.role == "decision") | nearest_to(@P_COST, 0.5) | limit(1)
`;

test("audit preserves ordered semantic DSLQL values without reranking", async () => {
  const report = await auditDslText(SOURCE, "semantic-query", {
    embeddings: { provider: "none" },
    semanticEmbedder: deterministicSemanticEmbedder,
  });

  assert.deepEqual(report.query_results[0]?.values, [
    {
      node: {
        node_kind: "statement",
        role: "decision",
        id: "D_COST",
        span: { line: 6, column: 3 },
        text: "安価な構成で運用コストを下げる",
        text_body: {
          syntax: "quoted",
          span: { line: 7, column: 5 },
          line_count: 1,
        },
        annotations: [],
        based_on: ["P_COST"],
      },
      score: 1,
      provider: "deterministic",
      model: "test-2d",
    },
  ]);
  assert.equal(report.query_results[0]?.total_value_count, 1);
  assert.equal(report.query_results[0]?.truncated, false);
  assert.equal(
    report.results.some((issue) =>
      issue.message.includes("semantic 検索を実行できない"),
    ),
    false,
  );
});

test("audit reports unavailable embeddings instead of widening results", async () => {
  const report = await auditDslText(SOURCE, "semantic-query-disabled", {
    embeddings: { provider: "none" },
  });

  assert.deepEqual(report.query_results[0]?.values, []);
  assert.equal(
    report.results.some(
      (issue) =>
        issue.severity === "info" &&
        issue.message.includes("semantic 検索を実行できない"),
    ),
    true,
  );
});

test("audit rejects an invalid semantic target without widening results", async () => {
  const invalid = SOURCE.replace(
    "nearest_to(@P_COST, 0.5)",
    "nearest_to(.text)",
  );
  const report = await auditDslText(invalid, "semantic-query-invalid", {
    embeddings: { provider: "none" },
    semanticEmbedder: async () => {
      throw new Error("embedder must not be called");
    },
  });

  assert.deepEqual(report.query_results[0]?.values, []);
  assert.equal(
    report.results.some(
      (issue) =>
        issue.severity === "error" &&
        issue.message.includes("semantic 検索契約が不正"),
    ),
    true,
  );
});

test("audit preserves scalar, object, and declaration query values", async () => {
  const report = await auditDslText(`
domain Design:
  description "design domain"

query BOOL:
  .document | has_open_pending()

query OBJECT:
  .document.domains[0] | {id: .id, kind: .node_kind}

query DOMAIN_REF:
  .document.domains[] | select(.id == @Design) | map(.id)
`);

  assert.deepEqual(
    report.query_results.map((result) => result.values),
    [[false], [{ id: "Design", kind: "domain" }], ["Design"]],
  );
  assert.equal(
    report.results.some((issue) => issue.message.includes("@Design")),
    false,
  );
});
