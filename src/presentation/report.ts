import type { AuditIssue, AuditReport } from "../model/diagnostics.js";

export interface AuditReportFormatOptions {
  maxIssues?: number;
  maxQueryItemsPerResult?: number;
}

const DEFAULT_MAX_AUDIT_ISSUES = 50;
const DEFAULT_MAX_QUERY_ITEMS_PER_RESULT = 20;
const SEVERITY_PRIORITY = {
  fatal: 0,
  error: 1,
  warning: 2,
  info: 3,
  hint: 4,
} as const;

function summarizeIssues(issues: AuditIssue[]): AuditReport["summary"] {
  return {
    fatal_count: issues.filter((issue) => issue.severity === "fatal").length,
    error_count: issues.filter((issue) => issue.severity === "error").length,
    warning_count: issues.filter((issue) => issue.severity === "warning").length,
    info_count: issues.filter((issue) => issue.severity === "info").length,
    hint_count: issues.filter((issue) => issue.severity === "hint").length,
  };
}

function sortIssuesBySeverity(issues: AuditIssue[]): AuditIssue[] {
  return issues
    .map((issue, index) => ({ issue, index }))
    .sort((left, right) => {
      const severityDiff =
        SEVERITY_PRIORITY[left.issue.severity] -
        SEVERITY_PRIORITY[right.issue.severity];
      return severityDiff !== 0 ? severityDiff : left.index - right.index;
    })
    .map(({ issue }) => issue);
}

function buildOverflowIssue(
  report: AuditReport,
  appliedLimit: number,
  omittedIssueCount: number,
): AuditIssue {
  return {
    issue_id: "ISSUE-OUTPUT-LIMIT",
    category: "output_limit",
    severity: "error",
    target_refs: [{ ref_id: report.document_id, role: "document" }],
    message: `監査結果が多すぎるため、上位 ${Math.max(appliedLimit - 1, 0)} 件のみを出力した。`,
    rationale:
      "件数上限に達したため、低優先度の issue は出力から省略された。重大度の高い issue を優先して表示している。",
    suggestion: "--limit を増やすか、対象を分割して再監査する。",
    metadata: {
      applied_limit: appliedLimit,
      omitted_issue_count: omittedIssueCount,
      original_issue_count: report.results.length,
    },
  };
}

export function limitAuditReport(
  report: AuditReport,
  options: AuditReportFormatOptions = {},
): AuditReport {
  const maxIssues = options.maxIssues ?? DEFAULT_MAX_AUDIT_ISSUES;
  const maxQueryItemsPerResult =
    options.maxQueryItemsPerResult ?? DEFAULT_MAX_QUERY_ITEMS_PER_RESULT;

  const limitedQueryResults = report.query_results.map((queryResult) => ({
    ...queryResult,
    items: queryResult.items.slice(0, maxQueryItemsPerResult),
  }));

  if (report.results.length <= maxIssues) {
    return {
      ...report,
      query_results: limitedQueryResults,
    };
  }

  const sortedIssues = sortIssuesBySeverity(report.results);
  const visibleIssueCount = Math.max(maxIssues - 1, 0);
  const visibleIssues = sortedIssues.slice(0, visibleIssueCount);
  const omittedIssueCount = sortedIssues.length - visibleIssues.length;
  const overflowIssue = buildOverflowIssue(report, maxIssues, omittedIssueCount);
  const limitedIssues = maxIssues > 0
    ? [...visibleIssues, overflowIssue]
    : [overflowIssue];

  return {
    ...report,
    summary: summarizeIssues(limitedIssues),
    results: limitedIssues,
    query_results: limitedQueryResults,
  };
}

function issueLine(issue: AuditIssue): string {
  const refs = issue.target_refs.map((ref) => ref.ref_id).join(", ");
  return `- [${issue.severity}] ${issue.category}: ${issue.message} (${refs})`;
}

function appendIssueDetails(lines: string[], issue: AuditIssue): void {
  appendOptionalLine(lines, "rationale", issue.rationale);
  appendOptionalLine(lines, "suggestion", issue.suggestion);
  const expectedSyntax =
    typeof issue.metadata?.expected_syntax === "string"
      ? issue.metadata.expected_syntax
      : undefined;
  if (expectedSyntax) {
    lines.push("  expected_syntax:");
    for (const line of expectedSyntax.split("\n")) {
      lines.push(`    ${line}`);
    }
  }
  const syntaxHelp =
    typeof issue.metadata?.syntax_help === "string"
      ? issue.metadata.syntax_help
      : undefined;
  if (syntaxHelp) {
    lines.push(`  syntax_help: ${syntaxHelp}`);
  }
  const syntaxGuidance =
    typeof issue.metadata?.syntax_guidance === "string"
      ? issue.metadata.syntax_guidance
      : undefined;
  if (syntaxGuidance) {
    lines.push("  syntax_guidance:");
    for (const line of syntaxGuidance.split("\n")) {
      lines.push(`    ${line}`);
    }
  }
}

function appendOptionalLine(
  lines: string[],
  label: string,
  value: string | undefined,
): void {
  if (value) {
    lines.push(`  ${label}: ${value}`);
  }
}

export function formatAuditReportText(
  report: AuditReport,
  options: AuditReportFormatOptions = {},
): string {
  const limitedReport = limitAuditReport(report, options);
  const lines: string[] = [];
  lines.push(`document: ${limitedReport.document_id}`);
  lines.push(`engine: ${limitedReport.engine_version}`);
  lines.push(
    `summary: fatal=${limitedReport.summary.fatal_count} error=${limitedReport.summary.error_count} warning=${limitedReport.summary.warning_count} info=${limitedReport.summary.info_count} hint=${limitedReport.summary.hint_count}`,
  );

  if (limitedReport.results.length > 0) {
    lines.push("");
    lines.push("issues:");
    for (const issue of limitedReport.results) {
      lines.push(issueLine(issue));
      appendIssueDetails(lines, issue);
    }
  }

  if (limitedReport.query_results.length > 0) {
    lines.push("");
    lines.push("query_results:");
    for (const queryResult of limitedReport.query_results) {
      lines.push(`- ${queryResult.query_id} [${queryResult.severity}]`);
      for (const item of queryResult.items) {
        const scoreText =
          item.score !== undefined ? ` score=${item.score}` : "";
        const explanation = item.explanation ? ` ${item.explanation}` : "";
        lines.push(`  - ${item.ref_id}${scoreText}${explanation}`);
      }
      const originalQueryResult = report.query_results.find(
        (candidate) => candidate.query_id === queryResult.query_id,
      );
      const omittedItems =
        (originalQueryResult?.items.length ?? queryResult.items.length) -
        queryResult.items.length;
      if (omittedItems > 0) {
        lines.push(`  - ... ${omittedItems} more query items omitted`);
      }
    }
  }

  return `${lines.join("\n")}\n`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function issueDetailsHtml(issue: AuditIssue): string {
  const parts: string[] = [];
  if (issue.rationale) {
    parts.push(
      `<p><strong>rationale</strong>: ${escapeHtml(issue.rationale)}</p>`,
    );
  }
  if (issue.suggestion) {
    parts.push(
      `<p><strong>suggestion</strong>: ${escapeHtml(issue.suggestion)}</p>`,
    );
  }
  const expectedSyntax =
    typeof issue.metadata?.expected_syntax === "string"
      ? issue.metadata.expected_syntax
      : undefined;
  if (expectedSyntax) {
    parts.push(
      `<p><strong>expected syntax</strong></p><pre><code>${escapeHtml(expectedSyntax)}</code></pre>`,
    );
  }
  const syntaxHelp =
    typeof issue.metadata?.syntax_help === "string"
      ? issue.metadata.syntax_help
      : undefined;
  if (syntaxHelp) {
    parts.push(
      `<p><strong>syntax help</strong>: <code>${escapeHtml(syntaxHelp)}</code></p>`,
    );
  }
  const syntaxGuidance =
    typeof issue.metadata?.syntax_guidance === "string"
      ? issue.metadata.syntax_guidance
      : undefined;
  if (syntaxGuidance) {
    parts.push(
      `<p><strong>syntax guidance</strong></p><pre><code>${escapeHtml(syntaxGuidance)}</code></pre>`,
    );
  }
  return parts.join("");
}

export function formatAuditReportHtml(
  report: AuditReport,
  options: AuditReportFormatOptions = {},
): string {
  const limitedReport = limitAuditReport(report, options);
  const issueRows = limitedReport.results
    .map(
      (issue) => `
        <tr>
          <td>${escapeHtml(issue.severity)}</td>
          <td>${escapeHtml(issue.category)}</td>
          <td>${escapeHtml(issue.target_refs.map((ref) => ref.ref_id).join(", "))}</td>
          <td>${escapeHtml(issue.message)}${issueDetailsHtml(issue)}</td>
        </tr>`,
    )
    .join("");

  const queryRows = limitedReport.query_results
    .map(
      (queryResult) => {
        const originalQueryResult = report.query_results.find(
          (candidate) => candidate.query_id === queryResult.query_id,
        );
        const omittedItems =
          (originalQueryResult?.items.length ?? queryResult.items.length) -
          queryResult.items.length;
        return `
        <li><strong>${escapeHtml(queryResult.query_id)}</strong>: ${queryResult.items
          .map((item) => {
            const scoreText =
              item.score !== undefined ? ` (${item.score})` : "";
            return `${escapeHtml(item.ref_id)}${scoreText}`;
          })
          .join(", ")}${omittedItems > 0 ? `, ... ${omittedItems} more` : ""}</li>`;
      },
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LLMThink Audit Report</title>
    <style>
      :root {
        color-scheme: light dark;
        --bg: #f4efe7;
        --surface: #fffaf2;
        --ink: #1f1b18;
        --muted: #6b6259;
        --accent: #0f766e;
        --border: #d9cfc2;
      }
      body {
        margin: 0;
        padding: 24px;
        font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
        background: radial-gradient(circle at top right, #d8efe8, var(--bg) 45%);
        color: var(--ink);
      }
      h1, h2 { margin: 0 0 12px; }
      .card {
        background: color-mix(in srgb, var(--surface) 88%, white 12%);
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 20px;
        margin-bottom: 18px;
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.05);
      }
      .summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 12px;
      }
      .metric {
        padding: 12px;
        border-radius: 12px;
        background: rgba(15, 118, 110, 0.08);
      }
      .metric strong {
        display: block;
        font-size: 1.4rem;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        padding: 10px;
        text-align: left;
        border-bottom: 1px solid var(--border);
        vertical-align: top;
      }
      th {
        color: var(--muted);
        font-size: 0.85rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      code {
        font-family: "IBM Plex Mono", "Cascadia Code", monospace;
      }
      pre {
        overflow-x: auto;
        padding: 12px;
        border-radius: 12px;
        background: rgba(15, 23, 42, 0.08);
      }
      ul { margin: 0; padding-left: 20px; }
    </style>
  </head>
  <body>
    <section class="card">
      <h1>${escapeHtml(report.document_id)}</h1>
      <p>engine <code>${escapeHtml(report.engine_version)}</code></p>
      <div class="summary">
        <div class="metric"><span>fatal</span><strong>${report.summary.fatal_count}</strong></div>
        <div class="metric"><span>error</span><strong>${report.summary.error_count}</strong></div>
        <div class="metric"><span>warning</span><strong>${report.summary.warning_count}</strong></div>
        <div class="metric"><span>info</span><strong>${report.summary.info_count}</strong></div>
        <div class="metric"><span>hint</span><strong>${report.summary.hint_count}</strong></div>
      </div>
    </section>
    <section class="card">
      <h2>Issues</h2>
      <table>
        <thead>
          <tr><th>Severity</th><th>Category</th><th>Refs</th><th>Message</th></tr>
        </thead>
        <tbody>${issueRows || '<tr><td colspan="4">No issues</td></tr>'}</tbody>
      </table>
    </section>
    <section class="card">
      <h2>Query Results</h2>
      <ul>${queryRows || "<li>No query results</li>"}</ul>
    </section>
  </body>
</html>`;
}
