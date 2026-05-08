import assert from "node:assert/strict";
import test from "node:test";

import { auditDslText } from "../../src/index.ts";

test("auditDslText validates comparison references", async () => {
  const report = await auditDslText(`
problem P1:
  "Compare decisions"

step:
  decision D1 based_on P1:
    "Option A"

step:
  comparison CMP1 on P1 viewpoint VP9 relation preferred_over D1, D2:
    "Missing refs should fail"
`);

  assert.equal(
    report.results.some((issue) => issue.message.includes("viewpoint VP9 を解決できない")),
    true,
  );
  assert.equal(
    report.results.some((issue) => issue.message.includes("decision D2 を解決できない")),
    true,
  );
});

test("auditDslText reports conflicting comparison relations inside one scope", async () => {
  const report = await auditDslText(`
problem P1:
  "Compare decisions"

step:
  viewpoint VP1:
    axis cost

step:
  decision D1 based_on P1, VP1:
    "Option A"

step:
  decision D2 based_on P1, VP1:
    "Option B"

step:
  comparison CMP1 on P1 viewpoint VP1 relation preferred_over D1, D2:
    "Cost favors A"

step:
  comparison CMP2 on P1 viewpoint VP1 relation incomparable D1, D2:
    "Do not order them"
`);

  assert.equal(
    report.results.some((issue) => issue.message.includes("incomparable と preference")),
    true,
  );
});

test("auditDslText does not treat counterexample comparisons as preference edges", async () => {
  const report = await auditDslText(`
problem P1:
  "Compare decisions"

step:
  viewpoint VP1:
    axis robustness

step:
  decision D1 based_on P1, VP1:
    "Claim A"

step:
  decision D2 based_on P1, VP1:
    "Counterexample B"

step:
  comparison CMP1 on P1 viewpoint VP1 relation counterexample_to D2, D1:
    "D2 rebuts D1"

step:
  comparison CMP2 on P1 viewpoint VP1 relation incomparable D1, D2:
    "Do not order them"
`);

  assert.equal(
    report.results.some((issue) => issue.message.includes("incomparable と preference")),
    false,
  );
});

test("auditDslText checks counterexample direction against decision status", async () => {
  const report = await auditDslText(`
problem P1:
  "Compare decisions"

step:
  viewpoint VP1:
    axis robustness

step:
  decision D1 based_on P1, VP1:
    "Claim A"

step:
  decision D2 based_on P1, VP1:
    "Counterexample B"
    annotation status:
      "negated"

step:
  comparison CMP1 on P1 viewpoint VP1 relation counterexample_to D2, D1:
    "D2 rebuts D1"
`);

  assert.equal(
    report.results.some((issue) => issue.message.includes("向きと status が逆転")),
    true,
  );
});