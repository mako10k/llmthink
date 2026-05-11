import assert from "node:assert/strict";
import test from "node:test";

import { auditDslText } from "../../src/index.ts";

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
  assert.match(messages.join("\n"), /problem P1 がどの decision からも直接参照されていない/);
  assert.match(messages.join("\n"), /premise PR1 がどの decision からも直接参照されていない/);
  assert.match(messages.join("\n"), /evidence EV1 がどの decision からも直接参照されていない/);
  assert.equal(messages.some((message) => message.includes("PR2")), false);

  const orphanProblem = report.results.find((issue) => issue.message.includes("problem P1"));
  const orphanEvidence = report.results.find((issue) => issue.message.includes("evidence EV1"));
  assert.equal(orphanProblem?.severity, "warning");
  assert.equal(orphanEvidence?.severity, "hint");
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
    report.results.some((issue) => issue.message.includes("annotation status retired は未定義")),
    true,
  );
  assert.equal(
    report.results.some((issue) => issue.message.includes("排他的な status が併記")),
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
    report.results.some((issue) => issue.message.includes("counterexample_to comparison または rationale がない")),
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
    report.results.some((issue) => issue.message.includes("block text が 1 行のみ") && issue.severity === "hint"),
    true,
  );
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
      (issue) => issue.message.includes("1 行の quoted text が長いため、block text に変えると読みやすい") && issue.severity === "hint",
    ),
    true,
  );
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
    report.results.some((issue) => issue.message.includes("annotation status は複数行を取れない") && issue.severity === "error"),
    true,
  );
});