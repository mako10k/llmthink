import type { AuditIssue, AuditReport } from "../model/diagnostics.js";

function issueLine(issue: AuditIssue): string {
  const refs = issue.target_refs.map((ref) => ref.ref_id).join(", ");
  return `- [${issue.severity}] ${issue.category}: ${issue.message} (${refs})`;
}

export function formatAuditReportText(report: AuditReport): string {
  const lines: string[] = [];
  lines.push(`document: ${report.document_id}`);
  lines.push(`engine: ${report.engine_version}`);
  lines.push(
    `summary: fatal=${report.summary.fatal_count} error=${report.summary.error_count} warning=${report.summary.warning_count} info=${report.summary.info_count} hint=${report.summary.hint_count}`,
  );

  if (report.results.length > 0) {
    lines.push("");
    lines.push("issues:");
    for (const issue of report.results) {
      lines.push(issueLine(issue));
    }
  }

  if (report.query_results.length > 0) {
    lines.push("");
    lines.push("query_results:");
    for (const queryResult of report.query_results) {
      lines.push(`- ${queryResult.query_id} [${queryResult.severity}]`);
      for (const item of queryResult.items) {
        const scoreText = item.score !== undefined ? ` score=${item.score}` : "";
        lines.push(`  - ${item.ref_id}${scoreText}${item.explanation ? ` ${item.explanation}` : ""}`);
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

export function formatAuditReportHtml(report: AuditReport): string {
  const issueRows = report.results
    .map(
      (issue) => `
        <tr>
          <td>${escapeHtml(issue.severity)}</td>
          <td>${escapeHtml(issue.category)}</td>
          <td>${escapeHtml(issue.target_refs.map((ref) => ref.ref_id).join(", "))}</td>
          <td>${escapeHtml(issue.message)}</td>
        </tr>`,
    )
    .join("");

  const queryRows = report.query_results
    .map(
      (queryResult) => `
        <li><strong>${escapeHtml(queryResult.query_id)}</strong>: ${queryResult.items
          .map((item) => `${escapeHtml(item.ref_id)}${item.score !== undefined ? ` (${item.score})` : ""}`)
          .join(", ")}</li>`,
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