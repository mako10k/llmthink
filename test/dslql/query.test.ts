import assert from "node:assert/strict";
import test from "node:test";

import {
  collectDslqlReferenceIds,
  evaluateDslqlExpression,
  parseDslqlExpression,
  type DslqlRuntime,
  type DslqlValue,
} from "../../src/dslql/query.ts";

function createRuntime(): DslqlRuntime {
  const steps: DslqlValue[] = [
    { id: "D2", role: "decision", score: 2, text: "second", tags: ["beta"] },
    { id: "D1", role: "decision", score: 1, text: "first", tags: ["alpha"] },
    { id: "D1", role: "decision", score: 1, text: "first duplicate", tags: ["alpha"] },
    { id: "EV1", role: "evidence", score: 3, text: "evidence", tags: ["shared"] },
  ];

  return {
    root: {
      problems: [
        { id: "P1", text: "problem one" },
        { id: "P2", text: "problem two" },
      ],
      steps,
      search: [
        { id: "T2", score: 0.2 },
        { id: "T1", score: 0.9 },
      ],
    },
    functions: {
      related_decisions: (input) =>
        input.flatMap(() =>
          steps.filter(
            (value): value is DslqlValue =>
              typeof value === "object" && value !== null && !Array.isArray(value) && value.role === "decision",
          ),
        ),
    },
  };
}

test("parseDslqlExpression parses stream operators", () => {
  const expression = parseDslqlExpression(
    '.steps[] | select(.role == "decision") | sort_by(.score) | limit(2)',
  );
  assert.equal(expression.type, "pipe");
});

test("collectDslqlReferenceIds finds problem id filters", () => {
  assert.deepEqual(
    collectDslqlReferenceIds(
      '.problems[] | select(.id == "P1") | related_decisions',
    ),
    ["P1"],
  );
});

test("evaluateDslqlExpression supports map and object projection", () => {
  const runtime = createRuntime();
  const result = evaluateDslqlExpression(
    '.steps[] | select(.role == "decision") | map({id: .id, text: .text})',
    runtime,
  );
  assert.deepEqual(result, [
    { id: "D2", text: "second" },
    { id: "D1", text: "first" },
    { id: "D1", text: "first duplicate" },
  ]);
});

test("evaluateDslqlExpression supports sort_by, unique_by, and limit", () => {
  const runtime = createRuntime();
  const result = evaluateDslqlExpression(
    '.steps[] | select(.role == "decision") | sort_by(.score) | unique_by(.id) | limit(2) | map(.id)',
    runtime,
  );
  assert.deepEqual(result, ["D1", "D2"]);
});

test("evaluateDslqlExpression collects the whole stream inside pipe", () => {
  const runtime = createRuntime();
  const result = evaluateDslqlExpression(
    '.steps[] | select(.role == "decision") | map(.id) | [.]',
    runtime,
  );
  assert.deepEqual(result, [["D2", "D1", "D1"]]);
});

test("evaluateDslqlExpression supports len over collected values", () => {
  const runtime = createRuntime();
  const result = evaluateDslqlExpression(
    '.steps[] | select(.role == "decision") | [.] | map({count: len(.), ids: .})',
    runtime,
  );
  assert.deepEqual(result, [
    { count: 3, ids: [
      { id: "D2", role: "decision", score: 2, text: "second", tags: ["beta"] },
      { id: "D1", role: "decision", score: 1, text: "first", tags: ["alpha"] },
      { id: "D1", role: "decision", score: 1, text: "first duplicate", tags: ["alpha"] },
    ] },
  ]);
});

test("evaluateDslqlExpression keeps related_decisions queries working with DSLQL shape", () => {
  const runtime = createRuntime();
  const result = evaluateDslqlExpression(
    '.problems[] | select(.id == "P1") | related_decisions | unique_by(.id) | map(.id)',
    runtime,
  );
  assert.deepEqual(result, ["D2", "D1"]);
});