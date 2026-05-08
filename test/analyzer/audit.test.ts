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