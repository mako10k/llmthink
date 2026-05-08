import assert from "node:assert/strict";
import test from "node:test";

import {
  formatThoughtSemanticAuditPairs,
  formatThoughtSemanticAuditSummary,
} from "../../src/presentation/thought.js";
import type { ThoughtSnapshot } from "../../src/thought/store.js";

function buildSnapshot(overrides: Partial<ThoughtSnapshot> = {}): ThoughtSnapshot {
  return {
    record: {
      id: "sample-thought",
      created_at: "2026-05-08T07:00:00Z",
      updated_at: "2026-05-08T07:00:00Z",
      status: "draft",
    },
    history: [],
    reflections: [],
    ...overrides,
  };
}

test("formatThoughtSemanticAuditSummary reports reviewed and unreviewed support pairs", () => {
  const snapshot = buildSnapshot({
    draftText: [
      "problem P1:",
      '  "Check support"',
      "",
      "step:",
      "  premise PR1:",
      '    "Premise"',
      "",
      "step:",
      "  evidence E1:",
      '    "Evidence"',
      "",
      "step:",
      "  decision D1 based_on PR1, E1:",
      '    "Decision"',
      "",
    ].join("\n"),
    semanticAuditText: [
      "semantic_audit SA1 on D1 support E1 verdict supported:",
      '  reviewer "QA reviewer"',
      "  model gpt-5.4",
      '  "Evidence supports the decision"',
      "",
    ].join("\n"),
  });

  const text = formatThoughtSemanticAuditSummary(snapshot);
  assert.match(text, /reviewed_pairs: 1/);
  assert.match(text, /supported_pairs: 1/);
  assert.match(text, /unreviewed_pairs: 1/);
});

test("formatThoughtSemanticAuditPairs lists reviewed and unreviewed pairs", () => {
  const snapshot = buildSnapshot({
    finalText: [
      "problem P1:",
      '  "Check support"',
      "",
      "step:",
      "  premise PR1:",
      '    "Premise"',
      "",
      "step:",
      "  evidence E1:",
      '    "Evidence"',
      "",
      "step:",
      "  decision D1 based_on PR1, E1:",
      '    "Decision"',
      "",
    ].join("\n"),
    semanticAuditText: [
      "semantic_audit SA1 on D1 support PR1 verdict mixed:",
      "  reviewer reviewer-a",
      '  "Needs follow-up"',
      "",
    ].join("\n"),
  });

  const text = formatThoughtSemanticAuditPairs(snapshot);
  assert.match(text, /SA1 D1<-PR1 \[mixed\] reason=Needs follow-up/);
  assert.match(text, /unreviewed_pairs:/);
  assert.match(text, /D1<-E1/);
});

test("formatThoughtSemanticAuditSummary reports absence cleanly", () => {
  const snapshot = buildSnapshot({ draftText: "" });
  assert.equal(formatThoughtSemanticAuditSummary(snapshot), "No semantic audit yet.\n");
  assert.equal(formatThoughtSemanticAuditPairs(snapshot), "No semantic audit yet.\n");
});