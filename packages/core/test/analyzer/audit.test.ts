import assert from "node:assert/strict";
import test from "node:test";

import { auditDslText } from "../../src/index.ts";

const SHARED_BASIS_DECISIONS = `
problem P1:
  "Choose an option"

step:
  decision D1 based_on P1:
    "Use option alpha"

step:
  decision D2 based_on P1:
    "Use option beta"
`;

test("shared evidence alone does not create a contradiction candidate", async () => {
  const report = await auditDslText(SHARED_BASIS_DECISIONS, "shared-basis", {
    embeddings: { provider: "none" },
  });

  assert.equal(
    report.results.some(
      (issue) => issue.category === "contradiction_candidate",
    ),
    false,
  );
  assert.equal(report.engine_version, "0.1.0");
  assert.equal(report.grammar_version, "1");
  assert.equal(report.package_version, "1.3.0");
  assert.deepEqual(report.semantic_analysis, {
    status: "disabled",
    provider: "none",
    model: null,
  });
});

test("semantic proximity requires observed embeddings above the threshold", async () => {
  const unavailable = await auditDslText(
    SHARED_BASIS_DECISIONS,
    "semantic-unavailable",
    { embeddings: { provider: "none" } },
  );
  assert.equal(
    unavailable.results.some((issue) => issue.message.includes("意味的に近接")),
    false,
  );

  const dissimilar = await auditDslText(
    SHARED_BASIS_DECISIONS,
    "semantic-dissimilar",
    {
      semanticEmbedder: async () => ({
        embeddings: [
          [1, 0],
          [0, 1],
        ],
        provider: "test",
        model: "orthogonal",
      }),
    },
  );
  assert.equal(
    dissimilar.results.some((issue) => issue.message.includes("意味的に近接")),
    false,
  );

  const similar = await auditDslText(
    SHARED_BASIS_DECISIONS,
    "semantic-similar",
    {
      semanticEmbedder: async () => ({
        embeddings: [
          [1, 0],
          [1, 0],
        ],
        provider: "test",
        model: "identical",
      }),
    },
  );
  const proximity = similar.results.find((issue) =>
    issue.message.includes("意味的に近接"),
  );
  assert.deepEqual(similar.semantic_analysis, {
    status: "available",
    provider: "test",
    model: "identical",
  });
  assert.equal(proximity?.metadata?.embedding_provider, "test");
  assert.equal(proximity?.metadata?.embedding_model, "identical");
  assert.equal(proximity?.metadata?.threshold, 0.75);

  const failed = await auditDslText(SHARED_BASIS_DECISIONS, "semantic-failed", {
    semanticEmbedder: async () => {
      throw new Error("unavailable");
    },
  });
  assert.deepEqual(failed.semantic_analysis, {
    status: "unavailable",
    provider: "custom",
    model: null,
  });
});

test("auditDslText reports orphan problems and supporting nodes from direct based_on edges", async () => {
  const report = await auditDslText(`
problem P1:
  "orphan problem"

problem P2:
  "linked problem"

step:
  premise PR1:
    "orphan premise"

step:
  evidence EV1:
    "orphan evidence"

step:
  premise PR2:
    "intentional future premise"
    annotation orphan_future:
      "次の release で接続する"

step:
  decision D1 based_on P2:
    "link only the second problem"
`);

  const messages = report.results.map((issue) => issue.message);
  assert.match(
    messages.join("\n"),
    /problem P1 がどの decision からも直接参照されていない/,
  );
  assert.match(
    messages.join("\n"),
    /premise PR1 がどの decision からも直接参照されていない/,
  );
  assert.match(
    messages.join("\n"),
    /evidence EV1 がどの decision からも直接参照されていない/,
  );
  assert.equal(
    messages.some((message) => message.includes("PR2")),
    false,
  );

  const orphanProblem = report.results.find((issue) =>
    issue.message.includes("problem P1"),
  );
  const orphanEvidence = report.results.find((issue) =>
    issue.message.includes("evidence EV1"),
  );
  assert.equal(orphanProblem?.severity, "warning");
  assert.equal(orphanEvidence?.severity, "hint");
  assert.equal(orphanProblem?.metadata?.orphan_profile, "direct-v1");
  assert.equal(
    orphanProblem?.metadata?.transitive_reachability,
    "not_expressible_in_grammar_v1",
  );
  assert.equal(orphanEvidence?.metadata?.orphan_profile, "direct-v1");
});

test("orphan annotations do not suppress unrelated contract violations", async () => {
  const report = await auditDslText(`
problem P1:
  "decision rule still applies"

step:
  decision D1:
    "missing based_on remains an error"
    annotation orphan_future:
      "intentional isolation marker"
`);

  assert.equal(
    report.results.some(
      (issue) =>
        issue.severity === "error" &&
        issue.message.includes("decision D1 に根拠参照がない"),
    ),
    true,
  );
});

test("auditDslText validates status annotation values and exclusivity", async () => {
  const report = await auditDslText(`
problem P1:
  "Track invalid statuses"

step:
  decision D1 based_on P1:
    "Option A"
    annotation status:
      "retired"
    annotation status:
      "negated"
    annotation status:
      "rejected"
`);

  assert.equal(
    report.results.some((issue) =>
      issue.message.includes("annotation status retired は未定義"),
    ),
    true,
  );
  assert.equal(
    report.results.some((issue) =>
      issue.message.includes("排他的な status が併記"),
    ),
    true,
  );
});

test("auditDslText reports unsupported negated status without comparison or rationale", async () => {
  const report = await auditDslText(`
problem P1:
  "Track unsupported statuses"

step:
  decision D1 based_on P1:
    "Option A"
    annotation status:
      "negated"
`);

  assert.equal(
    report.results.some((issue) =>
      issue.message.includes(
        "counterexample_to comparison または rationale がない",
      ),
    ),
    true,
  );
});

test("auditDslText suggests simplifying single-line block text", async () => {
  const report = await auditDslText(`
problem P1:
  |
    single line only

step:
  decision D1 based_on P1:
    "keep one quoted line here"
`);

  assert.equal(
    report.results.some(
      (issue) =>
        issue.message.includes("block text が 1 行のみ") &&
        issue.severity === "hint",
    ),
    true,
  );

  const issue = report.results.find((candidate) =>
    candidate.message.includes("block text が 1 行のみ"),
  );
  assert.equal(issue?.metadata?.syntax_help, "llmthink dsl help syntax detail");
  assert.match(String(issue?.metadata?.syntax_guidance), /quoted line/);
});

test("auditDslText suggests converting long single-line quoted text to block text", async () => {
  const report = await auditDslText(`
problem P1:
  "長すぎる 1 行 quoted text を block text へ寄せるべきかを確認するために、十分に長い本文をここへまとめて書き、さらに説明を足して監査の hint を確実に発火させる"

step:
  decision D1 based_on P1:
    "short line"
`);

  assert.equal(
    report.results.some(
      (issue) =>
        issue.message.includes(
          "1 行の quoted text が長いため、block text に変えると読みやすい",
        ) && issue.severity === "hint",
    ),
    true,
  );

  const issue = report.results.find((candidate) =>
    candidate.message.includes(
      "1 行の quoted text が長いため、block text に変えると読みやすい",
    ),
  );
  assert.equal(issue?.metadata?.syntax_help, "llmthink dsl help syntax detail");
  assert.match(String(issue?.metadata?.syntax_guidance), /block text/);
});

test("auditDslText rejects multiline status annotations", async () => {
  const report = await auditDslText(`
problem P1:
  "Track multiline status"

step:
  decision D1 based_on P1:
    "Option A"
    annotation status:
      |
        rejected
        with note
`);

  assert.equal(
    report.results.some(
      (issue) =>
        issue.message.includes("annotation status は複数行を取れない") &&
        issue.severity === "error",
    ),
    true,
  );
});
