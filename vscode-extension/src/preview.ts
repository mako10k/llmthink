import {
  ParseError,
  parseDocument,
  type Annotation,
  type DocumentAst,
  type FrameworkRule,
  type ProblemDecl,
  type StepDecl,
  type StepStatement,
} from "llmthink";

type DiagramRole = StepStatement["role"] | "external";

interface DiagramNode {
  key: string;
  title: string;
  subtitle: string;
  role: DiagramRole;
  column: number;
  row: number;
}

interface DiagramEdge {
  from: string;
  to: string;
}

const DIAGRAM_ROLE_ORDER: DiagramRole[] = [
  "premise",
  "evidence",
  "viewpoint",
  "partition",
  "decision",
  "pending",
  "external",
];

const DIAGRAM_ROLE_LABELS: Record<DiagramRole, string> = {
  premise: "Premises",
  evidence: "Evidence",
  viewpoint: "Viewpoints",
  partition: "Partitions",
  decision: "Decisions",
  pending: "Pending",
  external: "Unresolved refs",
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatAnnotationLabel(annotation: Annotation): string {
  return `${annotation.kind}: ${annotation.text}`;
}

function formatFrameworkRule(rule: FrameworkRule): string {
  return `${rule.kind} ${rule.value}`;
}

function formatProblem(problem: ProblemDecl): string[] {
  return [
    `### ${problem.name}`,
    "",
    problem.text,
    ...problem.annotations.map((annotation) =>
      `- Annotation: ${formatAnnotationLabel(annotation)}`,
    ),
    "",
  ];
}

function formatStatementSummary(statement: StepStatement): string {
  switch (statement.role) {
    case "premise":
    case "evidence":
    case "pending":
      return statement.text;
    case "decision":
      return statement.text;
    case "viewpoint":
      return `axis: ${statement.axis}`;
    case "partition":
      return statement.members
        .map((member) => `${member.name} := ${member.predicate}`)
        .join(", ");
  }
}

function formatStep(step: StepDecl): string[] {
  const statement = step.statement;
  const header = `### ${step.id} · ${statement.role} ${statement.id}`;
  const lines = [header, "", formatStatementSummary(statement)];

  if (statement.role === "decision" && statement.basedOn.length > 0) {
    lines.push(`- based_on: ${statement.basedOn.join(", ")}`);
  }

  if (
    statement.role === "premise" ||
    statement.role === "evidence" ||
    statement.role === "decision" ||
    statement.role === "pending"
  ) {
    lines.push(
      ...statement.annotations.map((annotation) =>
        `- Annotation: ${formatAnnotationLabel(annotation)}`,
      ),
    );
  }

  lines.push("");
  return lines;
}

function buildReferenceSection(document: DocumentAst): string[] {
  const edges = document.steps.flatMap((step) => {
    if (step.statement.role !== "decision" || step.statement.basedOn.length === 0) {
      return [];
    }
    return step.statement.basedOn.map((source) => `- ${source} -> ${step.statement.id}`);
  });

  if (edges.length === 0) {
    return ["## References", "", "No explicit based_on edges.", ""];
  }

  return ["## References", "", ...edges, ""];
}

function truncateSvgText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1)}…`;
}

function buildDiagramData(document: DocumentAst): {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  maxRows: number;
} {
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const rowCounts = new Map<DiagramRole, number>();
  const stepIds = new Set(document.steps.map((step) => step.statement.id));

  const nextRow = (role: DiagramRole): number => {
    const current = rowCounts.get(role) ?? 0;
    rowCounts.set(role, current + 1);
    return current;
  };

  for (const step of document.steps) {
    const role = step.statement.role;
    nodes.push({
      key: step.statement.id,
      title: truncateSvgText(step.statement.id, 24),
      subtitle: truncateSvgText(formatStatementSummary(step.statement), 42),
      role,
      column: DIAGRAM_ROLE_ORDER.indexOf(role),
      row: nextRow(role),
    });

    if (role === "decision") {
      for (const source of step.statement.basedOn) {
        edges.push({ from: source, to: step.statement.id });
      }
    }
  }

  const unresolvedReferences = new Set(
    edges
      .map((edge) => edge.from)
      .filter((source) => !stepIds.has(source)),
  );

  for (const source of unresolvedReferences) {
    nodes.push({
      key: source,
      title: truncateSvgText(source, 24),
      subtitle: "Referenced but not declared",
      role: "external",
      column: DIAGRAM_ROLE_ORDER.indexOf("external"),
      row: nextRow("external"),
    });
  }

  return {
    nodes,
    edges,
    maxRows: Math.max(...rowCounts.values(), 0),
  };
}

function buildSvgOverview(document: DocumentAst): string {
  const { nodes, edges, maxRows } = buildDiagramData(document);

  if (nodes.length === 0) {
    return `
      <section class="diagram-card empty-state">
        <div class="section-header">
          <div>
            <p class="section-kicker">SVG Graph</p>
            <h2>Step Map</h2>
          </div>
        </div>
        <p>構造化された step がまだないため、SVG 図は表示されません。</p>
      </section>
    `;
  }

  const nodeWidth = 184;
  const nodeHeight = 68;
  const columnGap = 28;
  const rowGap = 22;
  const marginX = 24;
  const marginTop = 48;
  const marginBottom = 24;
  const usedRoles = DIAGRAM_ROLE_ORDER.filter((role) =>
    nodes.some((node) => node.role === role),
  );
  const columnIndices = new Map(usedRoles.map((role, index) => [role, index]));
  const width = marginX * 2 + usedRoles.length * nodeWidth + Math.max(0, usedRoles.length - 1) * columnGap;
  const height = marginTop + maxRows * nodeHeight + Math.max(0, maxRows - 1) * rowGap + marginBottom;
  const positions = new Map<string, { x: number; y: number }>();

  const edgeMarkup = edges
    .map((edge) => {
      const fromNode = nodes.find((node) => node.key === edge.from);
      const toNode = nodes.find((node) => node.key === edge.to);
      if (!fromNode || !toNode) {
        return "";
      }

      const fromColumn = columnIndices.get(fromNode.role);
      const toColumn = columnIndices.get(toNode.role);
      if (fromColumn === undefined || toColumn === undefined) {
        return "";
      }

      const fromX = marginX + fromColumn * (nodeWidth + columnGap);
      const fromY = marginTop + fromNode.row * (nodeHeight + rowGap);
      const toX = marginX + toColumn * (nodeWidth + columnGap);
      const toY = marginTop + toNode.row * (nodeHeight + rowGap);
      positions.set(fromNode.key, { x: fromX, y: fromY });
      positions.set(toNode.key, { x: toX, y: toY });

      const startX = fromX + nodeWidth;
      const startY = fromY + nodeHeight / 2;
      const endX = toX;
      const endY = toY + nodeHeight / 2;
      const delta = Math.max(40, Math.abs(endX - startX) / 2);
      return `<path class="edge" d="M ${startX} ${startY} C ${startX + delta} ${startY}, ${endX - delta} ${endY}, ${endX} ${endY}" />`;
    })
    .join("\n");

  const columnMarkup = usedRoles
    .map((role) => {
      const column = columnIndices.get(role) ?? 0;
      const x = marginX + column * (nodeWidth + columnGap) + nodeWidth / 2;
      return `<text class="column-label" x="${x}" y="26" text-anchor="middle">${escapeHtml(DIAGRAM_ROLE_LABELS[role])}</text>`;
    })
    .join("\n");

  const nodeMarkup = nodes
    .map((node) => {
      const column = columnIndices.get(node.role);
      if (column === undefined) {
        return "";
      }
      const x = marginX + column * (nodeWidth + columnGap);
      const y = marginTop + node.row * (nodeHeight + rowGap);
      positions.set(node.key, { x, y });
      const titleY = y + 26;
      const subtitleY = y + 46;
      return `
        <g class="node node-${node.role}" transform="translate(${x}, ${y})">
          <rect width="${nodeWidth}" height="${nodeHeight}" rx="16" ry="16" />
          <text class="node-title" x="16" y="26">${escapeHtml(node.title)}</text>
          <text class="node-subtitle" x="16" y="46">${escapeHtml(node.subtitle)}</text>
        </g>
      `;
    })
    .join("\n");

  return `
    <section class="diagram-card">
      <div class="section-header">
        <div>
          <p class="section-kicker">SVG Graph</p>
          <h2>Step Map</h2>
        </div>
        <p class="section-meta">${nodes.length} nodes / ${edges.length} edges</p>
      </div>
      <div class="diagram-scroll">
        <svg class="diagram" viewBox="0 0 ${width} ${height}" role="img" aria-label="LLMThink step relationship graph">
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
              <path d="M 0 0 L 10 4 L 0 8 z" class="arrowhead" />
            </marker>
          </defs>
          ${columnMarkup}
          <g class="edges">${edgeMarkup}</g>
          <g class="nodes">${nodeMarkup}</g>
        </svg>
      </div>
    </section>
  `;
}

function buildPreviewMarkdown(document: DocumentAst, title: string): string {
  const lines: string[] = [`# ${title}`, ""];

  if (document.framework) {
    lines.push("## Framework", "");
    lines.push(`- ${document.framework.name}`);
    lines.push(...document.framework.rules.map((rule) => `- ${formatFrameworkRule(rule)}`));
    lines.push("");
  }

  if (document.domains.length > 0) {
    lines.push("## Domains", "");
    lines.push(
      ...document.domains.flatMap((domain) => [
        `### ${domain.name}`,
        "",
        domain.description,
        "",
      ]),
    );
  }

  if (document.problems.length > 0) {
    lines.push("## Problems", "");
    lines.push(...document.problems.flatMap(formatProblem));
  }

  if (document.steps.length > 0) {
    lines.push("## Steps", "");
    lines.push(...document.steps.flatMap(formatStep));
  }

  if (document.queries.length > 0) {
    lines.push("## Queries", "");
    lines.push(
      ...document.queries.flatMap((query) => [
        `### ${query.id}`,
        "",
        "```llmthink",
        query.expression,
        "```",
        "",
      ]),
    );
  }

  lines.push(...buildReferenceSection(document));
  return lines.join("\n");
}

function markdownToHtml(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const html: string[] = [];
  let inList = false;
  let inCodeBlock = false;
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }
    html.push(`<p>${paragraphLines.map(escapeHtml).join("<br />")}</p>`);
    paragraphLines = [];
  };

  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      flushParagraph();
      closeList();
      if (inCodeBlock) {
        html.push("</code></pre>");
        inCodeBlock = false;
      } else {
        html.push("<pre><code>");
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      html.push(`${escapeHtml(line)}\n`);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }

    const headingMatch = /^(#{1,3})\s+(.*)$/.exec(line);
    if (headingMatch) {
      flushParagraph();
      closeList();
      const level = headingMatch[1].length;
      html.push(`<h${level}>${escapeHtml(headingMatch[2])}</h${level}>`);
      continue;
    }

    if (line.startsWith("- ")) {
      flushParagraph();
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${escapeHtml(line.slice(2))}</li>`);
      continue;
    }

    paragraphLines.push(line);
  }

  flushParagraph();
  closeList();
  if (inCodeBlock) {
    html.push("</code></pre>");
  }
  return html.join("\n");
}

function buildErrorHtml(error: ParseError | Error, title: string): string {
  const message = error instanceof ParseError
    ? `${error.message} (line ${error.line}, column ${error.column})`
    : error.message;
  return `<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      body {
        font-family: var(--vscode-font-family);
        color: var(--vscode-editor-foreground);
        background: linear-gradient(180deg, var(--vscode-editor-background), color-mix(in srgb, var(--vscode-editor-background) 85%, var(--vscode-editorWarning-foreground) 15%));
        margin: 0;
        padding: 24px;
      }
      .card {
        border: 1px solid var(--vscode-inputValidation-errorBorder, var(--vscode-editorError-foreground));
        border-radius: 12px;
        padding: 20px;
        background: color-mix(in srgb, var(--vscode-editor-background) 92%, white 8%);
      }
      code {
        font-family: var(--vscode-editor-font-family);
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${escapeHtml(title)}</h1>
      <p>DSL をプレビューできませんでした。</p>
      <pre><code>${escapeHtml(message)}</code></pre>
    </div>
  </body>
</html>`;
}

function buildPreviewHtml(document: DocumentAst, markdown: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      :root {
        color-scheme: light dark;
      }
      body {
        margin: 0;
        padding: 32px;
        font-family: var(--vscode-font-family);
        color: var(--vscode-editor-foreground);
        background:
          radial-gradient(circle at top right, color-mix(in srgb, var(--vscode-button-background) 16%, transparent), transparent 30%),
          linear-gradient(180deg, color-mix(in srgb, var(--vscode-editor-background) 94%, black 6%), var(--vscode-editor-background));
      }
      .layout {
        max-width: 920px;
        margin: 0 auto;
        display: grid;
        gap: 20px;
      }
      .hero,
      .diagram-card,
      .markdown {
        border: 1px solid color-mix(in srgb, var(--vscode-editorWidget-border, var(--vscode-panel-border)) 80%, transparent);
        border-radius: 18px;
        background: color-mix(in srgb, var(--vscode-editor-background) 90%, white 10%);
        box-shadow: 0 18px 50px rgba(0, 0, 0, 0.18);
      }
      .hero {
        padding: 24px;
      }
      .diagram-card,
      .markdown {
        padding: 28px;
      }
      .eyebrow {
        font-size: 12px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--vscode-descriptionForeground);
      }
      h1 {
        margin: 8px 0 0;
        font-size: 28px;
        line-height: 1.2;
      }
      .section-header {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-end;
        margin-bottom: 18px;
      }
      .section-kicker {
        margin: 0;
        font-size: 12px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--vscode-descriptionForeground);
      }
      .section-header h2 {
        margin: 6px 0 0;
      }
      .section-meta {
        margin: 0;
        color: var(--vscode-descriptionForeground);
        white-space: nowrap;
      }
      .diagram-scroll {
        overflow-x: auto;
        padding-bottom: 8px;
      }
      .diagram {
        width: 100%;
        min-width: 680px;
        height: auto;
      }
      .column-label {
        fill: var(--vscode-descriptionForeground);
        font-size: 12px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .edge {
        fill: none;
        stroke: color-mix(in srgb, var(--vscode-textLink-foreground) 82%, transparent);
        stroke-width: 2;
        marker-end: url(#arrowhead);
      }
      .arrowhead {
        fill: color-mix(in srgb, var(--vscode-textLink-foreground) 82%, transparent);
      }
      .node rect {
        stroke-width: 1.2;
      }
      .node-title,
      .node-subtitle {
        fill: var(--vscode-editor-foreground);
        font-family: var(--vscode-font-family);
      }
      .node-title {
        font-size: 13px;
        font-weight: 600;
      }
      .node-subtitle {
        font-size: 11px;
        fill: color-mix(in srgb, var(--vscode-editor-foreground) 72%, transparent);
      }
      .node-premise rect {
        fill: color-mix(in srgb, var(--vscode-charts-blue) 18%, var(--vscode-editor-background));
        stroke: color-mix(in srgb, var(--vscode-charts-blue) 65%, transparent);
      }
      .node-evidence rect {
        fill: color-mix(in srgb, var(--vscode-charts-green) 18%, var(--vscode-editor-background));
        stroke: color-mix(in srgb, var(--vscode-charts-green) 65%, transparent);
      }
      .node-viewpoint rect {
        fill: color-mix(in srgb, var(--vscode-charts-yellow) 18%, var(--vscode-editor-background));
        stroke: color-mix(in srgb, var(--vscode-charts-yellow) 65%, transparent);
      }
      .node-partition rect {
        fill: color-mix(in srgb, var(--vscode-charts-orange) 18%, var(--vscode-editor-background));
        stroke: color-mix(in srgb, var(--vscode-charts-orange) 65%, transparent);
      }
      .node-decision rect {
        fill: color-mix(in srgb, var(--vscode-charts-purple) 18%, var(--vscode-editor-background));
        stroke: color-mix(in srgb, var(--vscode-charts-purple) 65%, transparent);
      }
      .node-pending rect {
        fill: color-mix(in srgb, var(--vscode-editorWarning-foreground) 16%, var(--vscode-editor-background));
        stroke: color-mix(in srgb, var(--vscode-editorWarning-foreground) 60%, transparent);
      }
      .node-external rect {
        fill: color-mix(in srgb, var(--vscode-disabledForeground) 14%, var(--vscode-editor-background));
        stroke: color-mix(in srgb, var(--vscode-disabledForeground) 65%, transparent);
        stroke-dasharray: 6 4;
      }
      .empty-state p {
        margin: 0;
      }
      h2, h3 {
        margin-top: 1.6em;
        margin-bottom: 0.5em;
      }
      p, li {
        line-height: 1.65;
      }
      ul {
        padding-left: 1.4rem;
      }
      pre {
        overflow-x: auto;
        padding: 14px;
        border-radius: 12px;
        background: color-mix(in srgb, var(--vscode-textCodeBlock-background) 88%, black 12%);
      }
      code {
        font-family: var(--vscode-editor-font-family);
      }
    </style>
  </head>
  <body>
    <main class="layout">
      <section class="hero">
        <div class="eyebrow">LLMThink Preview</div>
        <h1>${escapeHtml(title)}</h1>
      </section>
      ${buildSvgOverview(document)}
      <section class="markdown">
        ${markdownToHtml(markdown)}
      </section>
    </main>
  </body>
</html>`;
}

export function renderDslPreview(text: string, title: string): string {
  try {
    const document = parseDocument(text);
    const markdown = buildPreviewMarkdown(document, title);
    return buildPreviewHtml(document, markdown, title);
  } catch (error) {
    if (error instanceof ParseError || error instanceof Error) {
      return buildErrorHtml(error, title);
    }
    return buildErrorHtml(new Error(String(error)), title);
  }
}