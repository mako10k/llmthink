import assert from "node:assert/strict";
import test from "node:test";

import {
  formatAuditReportHtml,
  formatAuditReportText,
  limitAuditReport,
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

test("limitAuditReport keeps highest severities and adds overflow issue", () => {
  const report = buildReport(0, 0);
  report.results = [
    {
      issue_id: "ISSUE-1",
      category: "semantic_hint",
      severity: "hint",
      target_refs: [{ ref_id: "H1" }],
      message: "Hint issue",
    },
    {
      issue_id: "ISSUE-2",
      category: "contract_violation",
      severity: "fatal",
      target_refs: [{ ref_id: "F1" }],
      message: "Fatal issue",
    },
    {
      issue_id: "ISSUE-3",
      category: "contract_violation",
      severity: "warning",
      target_refs: [{ ref_id: "W1" }],
      message: "Warning issue",
    },
  ];
  report.summary = {
    fatal_count: 1,
    error_count: 0,
    warning_count: 1,
    info_count: 0,
    hint_count: 1,
  };

  const limited = limitAuditReport(report, { maxIssues: 2 });

  assert.deepEqual(
    limited.results.map((issue) => [issue.severity, issue.category, issue.message]),
    [
      ["fatal", "contract_violation", "Fatal issue"],
      ["error", "output_limit", "監査結果が多すぎるため、上位 1 件のみを出力した。"],
    ],
  );
});

test("formatAuditReportText limits issues and query items by default", () => {
  const text = formatAuditReportText(buildReport(55, 25));

  assert.equal(text.includes("Issue 49"), true);
  assert.equal(text.includes("Issue 50"), false);
  assert.match(text, /\[error\] output_limit: 監査結果が多すぎるため、上位 49 件のみを出力した。/);
  assert.equal(text.includes("R20 score=20"), true);
  assert.equal(text.includes("R21 score=21"), false);
  assert.match(text, /5 more query items omitted/);
});

test("formatAuditReportHtml limits issues by default", () => {
  const html = formatAuditReportHtml(buildReport(55, 25));

  assert.equal(html.includes("Issue 49"), true);
  assert.equal(html.includes("Issue 50"), false);
  assert.match(html, /監査結果が多すぎるため、上位 49 件のみを出力した。/);
  assert.match(html, /R20 \(20\)/);
  assert.doesNotMatch(html, /R21 \(21\)/);
  assert.match(html, /5 more/);
});