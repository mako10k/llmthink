import assert from "node:assert/strict";
import test from "node:test";

import { auditDslText } from "../../src/index.ts";

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

test("audit executes semantic DSLQL and preserves its ranking", async () => {
  const report = await auditDslText(SOURCE, "semantic-query", {
    embeddings: { provider: "none" },
    semanticEmbedder: async (texts: string[]) => ({
      embeddings: texts.map((text) => {
        if (text.includes("速度")) return [0, 1];
        if (text.includes("コスト") || text.includes("安価")) return [1, 0];
        return [0.1, 0.1];
      }),
      provider: "deterministic",
      model: "test-2d",
    }),
  });

  assert.deepEqual(report.query_results[0]?.items, [
    {
      ref_id: "D_COST",
      score: 1,
      explanation:
        '.document.steps[].statement | select(.role == "decision") | nearest_to(@P_COST, 0.5) | limit(1) の nearest_to() 候補。 (deterministic/test-2d)',
    },
  ]);
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

  assert.deepEqual(report.query_results[0]?.items, []);
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

  assert.deepEqual(report.query_results[0]?.items, []);
  assert.equal(
    report.results.some(
      (issue) =>
        issue.severity === "error" &&
        issue.message.includes("semantic 検索契約が不正"),
    ),
    true,
  );
});
