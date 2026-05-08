import assert from "node:assert/strict";
import test from "node:test";

import {
  formatAuditReportHtml,
  formatAuditReportText,
} from "../../src/presentation/report.ts";
import type { AuditReport } from "../../src/model/diagnostics.ts";

function buildReport(issueCount: number, queryItemCount = 0): AuditReport {
  return {
    engine_version: "test-engine",
    document_id: "sample-doc",
    generated_at: "2026-05-08T00:00:00Z",
    summary: {
      fatal_count: 0,
      error_count: issueCount,
      warning_count: 0,
      info_count: 0,
      hint_count: 0,
    },
    results: Array.from({ length: issueCount }, (_, index) => ({
      issue_id: `ISSUE-${index + 1}`,
      category: "contract_violation",
      severity: "error",
      target_refs: [{ ref_id: `D${index + 1}`, role: "decision", step_id: `S${index + 1}` }],
      message: `Issue ${index + 1}`,
    })),
    query_results: queryItemCount > 0
      ? [
          {
            query_id: "Q1",
            severity: "hint",
            items: Array.from({ length: queryItemCount }, (_, index) => ({
              ref_id: `R${index + 1}`,
              score: index + 1,
            })),
          },
        ]
      : [],
  };
}

test("formatAuditReportText limits issues and query items by default", () => {
  const text = formatAuditReportText(buildReport(55, 25));

  assert.equal(text.includes("Issue 50"), true);
  assert.equal(text.includes("Issue 51"), false);
  assert.match(text, /5 more issues omitted/);
  assert.equal(text.includes("R20 score=20"), true);
  assert.equal(text.includes("R21 score=21"), false);
  assert.match(text, /5 more query items omitted/);
});

test("formatAuditReportHtml limits issues by default", () => {
  const html = formatAuditReportHtml(buildReport(55, 25));

  assert.equal(html.includes("Issue 50"), true);
  assert.equal(html.includes("Issue 51"), false);
  assert.match(html, /Showing first 50 of 55 issues/);
  assert.match(html, /R20 \(20\)/);
  assert.doesNotMatch(html, /R21 \(21\)/);
  assert.match(html, /5 more/);
});