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