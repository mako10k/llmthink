import assert from "node:assert/strict";
import test from "node:test";

import {
  formatAuditReportHtml,
  formatAuditReportText,
  limitAuditReport,
} from "../../src/presentation/report.ts";
import type { AuditReport } from "../../src/model/diagnostics.ts";

function buildReport(issueCount: number, queryValueCount = 0): AuditReport {
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
      target_refs: [
        { ref_id: `D${index + 1}`, role: "decision", step_id: `S${index + 1}` },
      ],
      message: `Issue ${index + 1}`,
    })),
    query_results:
      queryValueCount > 0
        ? [
            {
              query_id: "Q1",
              severity: "hint",
              values: Array.from({ length: queryValueCount }, (_, index) => ({
                id: `R${index + 1}`,
                score: index + 1,
              })),
              total_value_count: queryValueCount,
              truncated: false,
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
    limited.results.map((issue) => [
      issue.severity,
      issue.category,
      issue.message,
    ]),
    [
      ["fatal", "contract_violation", "Fatal issue"],
      [
        "error",
        "output_limit",
        "監査結果が多すぎるため、上位 1 件のみを出力した。",
      ],
    ],
  );
});

test("limitAuditReport applies minimum severity before the output limit", () => {
  const report = buildReport(0, 3);
  report.results = [
    {
      issue_id: "ISSUE-WARNING",
      category: "contradiction_candidate",
      severity: "warning",
      target_refs: [{ ref_id: "W1" }],
      message: "Warning issue",
    },
    ...Array.from({ length: 101 }, (_, index) => ({
      issue_id: `ISSUE-INFO-${index + 1}`,
      category: "semantic_hint" as const,
      severity: "info" as const,
      target_refs: [{ ref_id: `I${index + 1}` }],
      message: `Info issue ${index + 1}`,
    })),
  ];

  const filtered = limitAuditReport(report, {
    maxIssues: 100,
    minSeverity: "warning",
  });

  assert.deepEqual(
    filtered.results.map((issue) => issue.issue_id),
    ["ISSUE-WARNING"],
  );
  assert.deepEqual(filtered.summary, {
    fatal_count: 0,
    error_count: 0,
    warning_count: 1,
    info_count: 0,
    hint_count: 0,
  });
  assert.deepEqual(filtered.query_results, []);
});

test("limitAuditReport suppresses categories before the output limit", () => {
  const report = buildReport(0);
  report.results = [
    {
      issue_id: "ISSUE-ERROR",
      category: "contract_violation",
      severity: "error",
      target_refs: [{ ref_id: "E1" }],
      message: "Error issue",
    },
    ...Array.from({ length: 101 }, (_, index) => ({
      issue_id: `ISSUE-HINT-${index + 1}`,
      category: "semantic_hint" as const,
      severity: "hint" as const,
      target_refs: [{ ref_id: `H${index + 1}` }],
      message: `Hint issue ${index + 1}`,
    })),
  ];

  const filtered = limitAuditReport(report, {
    maxIssues: 100,
    suppressedCategories: ["semantic_hint"],
  });

  assert.deepEqual(
    filtered.results.map((issue) => issue.issue_id),
    ["ISSUE-ERROR"],
  );
  assert.equal(
    filtered.results.some((issue) => issue.category === "output_limit"),
    false,
  );
});

test("limitAuditReport can suppress query result output by category", () => {
  const filtered = limitAuditReport(buildReport(1, 3), {
    suppressedCategories: ["query_result"],
  });

  assert.deepEqual(filtered.query_results, []);
  assert.equal(filtered.results.length, 1);
});

test("formatAuditReportText limits query values explicitly by default", () => {
  const text = formatAuditReportText(buildReport(55, 25));

  assert.equal(text.includes("Issue 49"), true);
  assert.equal(text.includes("Issue 50"), false);
  assert.match(
    text,
    /\[error\] output_limit: 監査結果が多すぎるため、上位 49 件のみを出力した。/,
  );
  assert.equal(text.includes('{"id":"R20","score":20}'), true);
  assert.equal(text.includes('{"id":"R21","score":21}'), false);
  assert.match(text, /5 more query values omitted/);

  const original = buildReport(0, 25);
  const limited = limitAuditReport(original);
  assert.equal(original.query_results[0]?.values.length, 25);
  assert.equal(original.query_results[0]?.truncated, false);
  assert.equal(limited.query_results[0]?.values.length, 20);
  assert.equal(limited.query_results[0]?.total_value_count, 25);
  assert.equal(limited.query_results[0]?.truncated, true);
});

test("limitAuditReport preserves an upstream query truncation boundary", () => {
  const report = buildReport(0, 2);
  report.query_results[0]!.total_value_count = 5;

  const limited = limitAuditReport(report, { maxQueryValuesPerResult: 20 });

  assert.equal(limited.query_results[0]?.values.length, 2);
  assert.equal(limited.query_results[0]?.total_value_count, 5);
  assert.equal(limited.query_results[0]?.truncated, true);
});

test("formatAuditReportHtml limits issues by default", () => {
  const html = formatAuditReportHtml(buildReport(55, 25));

  assert.equal(html.includes("Issue 49"), true);
  assert.equal(html.includes("Issue 50"), false);
  assert.match(html, /監査結果が多すぎるため、上位 49 件のみを出力した。/);
  assert.match(html, /&quot;id&quot;:&quot;R20&quot;/);
  assert.doesNotMatch(html, /&quot;id&quot;:&quot;R21&quot;/);
  assert.match(html, /5 more/);
});

test("formatAuditReportHtml renders the filtered summary", () => {
  const report = buildReport(2);
  report.results[0] = {
    ...report.results[0]!,
    severity: "info",
  };

  const html = formatAuditReportHtml(report, { minSeverity: "error" });

  assert.match(html, /<span>error<\/span><strong>1<\/strong>/);
  assert.match(html, /<span>info<\/span><strong>0<\/strong>/);
});
