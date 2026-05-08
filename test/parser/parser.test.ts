import assert from "node:assert/strict";
import test from "node:test";

import { formatDslText, parseDocument } from "../../src/index.ts";

test("parseDocument ignores standalone comment lines", () => {
  const document = parseDocument(`
# document note
domain Review:
  # domain note
  description "Comment support"

problem P1:
  # body note
  "Decide comment syntax"

step S1:
  # step note
  evidence EV1:
    # evidence note
    "Parser should skip comment lines"

query Q1:
  # query note
  .problems[]
`);

  assert.equal(document.domains[0]?.name, "Review");
  assert.equal(document.problems[0]?.text, "Decide comment syntax");
  assert.equal(document.steps[0]?.statement.role, "evidence");
  assert.equal(document.queries[0]?.expression, ".problems[]");
});

test("formatDslText drops standalone comment lines during normalization", () => {
  const formatted = formatDslText(`
problem P1:
  "Decide comment syntax"

  # comments are ignored by the formatter in phase 1
step S1:
  decision D1:
    # formatter should not preserve this
    "Ship standalone comments first"
`);

  assert.equal(
    formatted,
    [
      'problem P1:',
      '  "Decide comment syntax"',
      "",
      "step S1:",
      "  decision D1:",
      '    "Ship standalone comments first"',
      "",
    ].join("\n"),
  );
});

test("parseDocument collects annotations on problems and text statements", () => {
  const document = parseDocument(`
problem P1:
  "Decide comment syntax"
  annotation rationale:
    "Separate annotations from free comments"
  annotation status:
    "superseded"
  annotation orphan_reference:
    "Reference-only problem"

step S1:
  decision D1 based_on P1:
    "Ship standalone comments first"
    annotation caveat:
      "Formatter intentionally drops free comments"
    annotation todo:
      "Preserve comment trivia later"
    annotation orphan_future:
      "Keep this branch visible"
`);

  assert.deepEqual(document.problems[0]?.annotations.map((item) => item.kind), [
    "rationale",
    "status",
    "orphan_reference",
  ]);
  assert.deepEqual(
    document.steps[0]?.statement.role === "decision"
      ? document.steps[0].statement.annotations.map((item) => item.kind)
      : [],
    ["caveat", "todo", "orphan_future"],
  );
});

test("formatDslText preserves annotations in normalized output", () => {
  const formatted = formatDslText(`
problem P1:
  "Decide comment syntax"
  annotation explanation:
    "Annotations remain first-class"

step S1:
  evidence EV1:
    "Parser and formatter should agree"
    annotation todo:
      "Teach the LSP snippet next"
`);

  assert.equal(
    formatted,
    [
      "problem P1:",
      '  "Decide comment syntax"',
      "  annotation explanation:",
      '    "Annotations remain first-class"',
      "",
      "step S1:",
      "  evidence EV1:",
      '    "Parser and formatter should agree"',
      "    annotation todo:",
      '      "Teach the LSP snippet next"',
      "",
    ].join("\n"),
  );
});

test("parseDocument accepts step headers without explicit step ids", () => {
  const document = parseDocument(`
problem P1:
  "Allow implicit step ids"

step:
  premise PR1:
    "Parser synthesizes the step id from the statement id"
`);

  assert.equal(document.steps[0]?.id, "S-PR1");
  assert.equal(document.steps[0]?.syntax.step, "explicit");
  assert.equal(document.steps[0]?.syntax.stepId, "synthetic");
  assert.equal(document.steps[0]?.statement.id, "PR1");
  assert.equal(document.steps[0]?.statement.role, "premise");
});

test("parseDocument accepts top-level statements as implicit steps", () => {
  const document = parseDocument(`
problem P1:
  "Allow flattened step syntax"

evidence EV1:
  "Top-level evidence becomes an implicit step"

decision D1 based_on EV1:
  "Top-level decision also becomes an implicit step"
`);

  assert.equal(document.steps.length, 2);
  assert.equal(document.steps[0]?.id, "S-EV1");
  assert.equal(document.steps[0]?.syntax.step, "implicit");
  assert.equal(document.steps[0]?.syntax.stepId, "synthetic");
  assert.equal(document.steps[0]?.statement.role, "evidence");
  assert.equal(document.steps[1]?.id, "S-D1");
  assert.equal(document.steps[1]?.syntax.step, "implicit");
  assert.equal(document.steps[1]?.syntax.stepId, "synthetic");
  assert.equal(document.steps[1]?.statement.role, "decision");
});

test("formatDslText preserves explicit anonymous step syntax", () => {
  const formatted = formatDslText(`
problem P1:
  "Allow implicit step ids"

step:
  premise PR1:
    "Parser synthesizes the step id from the statement id"
`);

  assert.equal(
    formatted,
    [
      "problem P1:",
      '  "Allow implicit step ids"',
      "",
      "step:",
      "  premise PR1:",
      '    "Parser synthesizes the step id from the statement id"',
      "",
    ].join("\n"),
  );
});

test("formatDslText preserves fully implicit step syntax", () => {
  const formatted = formatDslText(`
problem P1:
  "Allow flattened step syntax"

evidence EV1:
  "Top-level evidence becomes an implicit step"
`);

  assert.equal(
    formatted,
    [
      "problem P1:",
      '  "Allow flattened step syntax"',
      "",
      "evidence EV1:",
      '  "Top-level evidence becomes an implicit step"',
      "",
    ].join("\n"),
  );
});

test("parseDocument accepts scoped comparison statements", () => {
  const document = parseDocument(`
problem P1:
  "Compare decisions in one scope"

step S1:
  viewpoint VP1:
    axis cost

step S2:
  decision D1 based_on P1:
    "Choose hosted option"

step S3:
  decision D2 based_on P1:
    "Choose self-hosted option"

step S4:
  comparison CMP1 on P1 viewpoint VP1 relation preferred_over D1, D2:
    "Cost favors hosted option"
`);

  assert.equal(document.steps[3]?.statement.role, "comparison");
  assert.equal(
    document.steps[3]?.statement.role === "comparison"
      ? document.steps[3].statement.relation
      : undefined,
    "preferred_over",
  );
});

test("formatDslText preserves comparison syntax", () => {
  const formatted = formatDslText(`
problem P1:
  "Compare decisions in one scope"

viewpoint VP1:
  axis cost

decision D1 based_on P1:
  "Choose hosted option"

decision D2 based_on P1:
  "Choose self-hosted option"

comparison CMP1 on P1 viewpoint VP1 relation preferred_over D1, D2:
  "Cost favors hosted option"
`);

  assert.match(
    formatted,
    /comparison CMP1 on P1 viewpoint VP1 relation preferred_over D1, D2:/,
  );
});

test("parseDocument accepts counterexample comparison relations", () => {
  const document = parseDocument(`
problem P1:
  "Check counterexamples"

step S1:
  viewpoint VP1:
    axis robustness

step S2:
  decision D1 based_on P1:
    "Adopt claim A"

step S3:
  decision D2 based_on P1:
    "Present claim B"

step S4:
  comparison CMP1 on P1 viewpoint VP1 relation counterexample_to D2, D1:
    "D2 breaks a premise of D1"
`);

  assert.equal(document.steps[3]?.statement.role, "comparison");
  assert.equal(
    document.steps[3]?.statement.role === "comparison"
      ? document.steps[3].statement.relation
      : undefined,
    "counterexample_to",
  );
});