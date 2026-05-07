import dagre from "@dagrejs/dagre";
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
  line?: number;
  column?: number;
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
} {
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const stepIds = new Set(document.steps.map((step) => step.statement.id));

  for (const step of document.steps) {
    const role = step.statement.role;
    nodes.push({
      key: step.statement.id,
      title: truncateSvgText(step.statement.id, 24),
      subtitle: truncateSvgText(formatStatementSummary(step.statement), 56),
      role,
      line: step.statement.span.line,
      column: step.statement.span.column,
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
    });
  }

  return {
    nodes,
    edges,
  };
}

function wrapSvgText(value: string, maxLength: number, maxLines: number): string[] {
  const tokens = Array.from(
    value.matchAll(/[A-Za-z0-9_./:-]+|\s+|[^\s]/gu),
    (match) => match[0],
  );
  const lines: string[] = [];
  let current = "";
  let currentWidth = 0;

  const tokenWidth = (token: string): number => {
    let width = 0;
    for (const char of token) {
      if (/\s/u.test(char)) {
        width += 0.45;
      } else if (/[A-Za-z0-9_./:-]/u.test(char)) {
        width += 0.72;
      } else {
        width += 1;
      }
    }
    return width;
  };

  const pushLine = () => {
    if (current.trim().length > 0) {
      lines.push(current.trim());
    }
    current = "";
    currentWidth = 0;
  };

  for (const token of tokens) {
    const width = tokenWidth(token);
    if (currentWidth + width <= maxLength || current.length === 0) {
      current += token;
      currentWidth += width;
      continue;
    }

    pushLine();
    if (lines.length === maxLines) {
      break;
    }

    current = token.trimStart();
    currentWidth = tokenWidth(current);
  }

  if (lines.length < maxLines && current.trim().length > 0) {
    pushLine();
  }

  if (lines.length === 0) {
    return [truncateSvgText(value, Math.floor(maxLength))];
  }

  if (lines.length > maxLines) {
    return [
      ...lines.slice(0, maxLines - 1),
      truncateSvgText(lines[maxLines - 1], Math.floor(maxLength)),
    ];
  }

  if (lines.length === maxLines && lines.join("").length < value.trim().length) {
    const lastIndex = lines.length - 1;
    lines[lastIndex] = truncateSvgText(lines[lastIndex], Math.floor(maxLength));
  }

  return lines;
}

function toSvgPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) {
    return "";
  }

  const [first, ...rest] = points;
  return rest.reduce(
    (path, point, index) => {
      const previous = index === 0 ? first : rest[index - 1];
      const controlX = (previous.x + point.x) / 2;
      return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
    },
    `M ${first.x} ${first.y}`,
  );
}

function buildSvgOverview(document: DocumentAst): string {
  const { nodes, edges } = buildDiagramData(document);

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

  const nodeWidth = 236;
  const nodeHeight = 94;
  const laneGap = 84;
  const rowGap = 30;
  const headerHeight = 18;
  const marginX = 28;
  const marginY = 16;
  const graph = new dagre.graphlib.Graph();
  const usedRoles = DIAGRAM_ROLE_ORDER.filter((role) =>
    nodes.some((node) => node.role === role),
  );

  graph.setGraph({
    rankdir: "LR",
    ranksep: 100,
    nodesep: 48,
    edgesep: 22,
    marginx: 24,
    marginy: 24,
    acyclicer: "greedy",
    ranker: "network-simplex",
  });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    graph.setNode(node.key, {
      width: nodeWidth,
      height: nodeHeight,
      role: node.role,
    });
  }

  for (const edge of edges) {
    graph.setEdge(edge.from, edge.to);
  }

  dagre.layout(graph);

  const laneIndexByRole = new Map(usedRoles.map((role, index) => [role, index]));
  const positionedNodes = nodes.map((node) => ({
    node,
    layout: graph.node(node.key) as { x: number; y: number; width: number; height: number },
  }));

  const laneRows = new Map<DiagramRole, Array<typeof positionedNodes[number]>>();
  for (const positioned of positionedNodes) {
    const current = laneRows.get(positioned.node.role) ?? [];
    current.push(positioned);
    laneRows.set(positioned.node.role, current);
  }

  const nodePositions = new Map<string, { x: number; y: number; width: number; height: number }>();
  let maxRows = 0;

  for (const role of usedRoles) {
    const laneNodes = (laneRows.get(role) ?? []).sort((left, right) => left.layout.y - right.layout.y);
    maxRows = Math.max(maxRows, laneNodes.length);
    laneNodes.forEach((positioned, index) => {
      const laneIndex = laneIndexByRole.get(role) ?? 0;
      const x = marginX + laneIndex * (nodeWidth + laneGap);
      const y = marginY + headerHeight + 26 + index * (nodeHeight + rowGap);
      nodePositions.set(positioned.node.key, {
        x,
        y,
        width: nodeWidth,
        height: nodeHeight,
      });
    });
  }

  const width = Math.max(760, marginX * 2 + usedRoles.length * nodeWidth + Math.max(0, usedRoles.length - 1) * laneGap);
  const height = marginY * 2 + headerHeight + 26 + maxRows * nodeHeight + Math.max(0, maxRows - 1) * rowGap;

  const edgeMarkup = edges
    .map((edge) => {
      const source = nodePositions.get(edge.from);
      const target = nodePositions.get(edge.to);
      if (!source || !target) {
        return "";
      }

      const startX = source.x + source.width;
      const startY = source.y + source.height / 2;
      const endX = target.x;
      const endY = target.y + target.height / 2;
      const middleX = (startX + endX) / 2;

      return `<path class="edge" d="M ${startX} ${startY} C ${middleX} ${startY}, ${middleX} ${endY}, ${endX} ${endY}" />`;
    })
    .join("\n");

  const laneLabelMarkup = usedRoles
    .map((role) => {
      const laneIndex = laneIndexByRole.get(role) ?? 0;
      const x = marginX + laneIndex * (nodeWidth + laneGap) + nodeWidth / 2;
      return `<text class="lane-label" x="${x}" y="22" text-anchor="middle">${escapeHtml(DIAGRAM_ROLE_LABELS[role])}</text>`;
    })
    .join("\n");

  const legendMarkup = usedRoles
    .map((role) => {
      return `
        <span class="legend-chip legend-${role}">
          <span class="legend-dot"></span>
          ${escapeHtml(DIAGRAM_ROLE_LABELS[role])}
        </span>
      `;
    })
    .join("\n");

  const nodeMarkup = nodes
    .map((node) => {
      const layoutNode = nodePositions.get(node.key);
      if (!layoutNode) {
        return "";
      }
      const titleLines = wrapSvgText(node.title, 20, 1);
      const subtitleLines = wrapSvgText(node.subtitle, 26, 3);
      const roleLabel = DIAGRAM_ROLE_LABELS[node.role];
      const dataAttributes = node.line && node.column
        ? `data-line="${node.line}" data-column="${node.column}" tabindex="0" role="button" aria-label="Reveal ${escapeHtml(node.key)} in source"`
        : "";
      return `
        <g class="node node-${node.role}" transform="translate(${layoutNode.x}, ${layoutNode.y})" ${dataAttributes}>
          <rect width="${layoutNode.width}" height="${layoutNode.height}" rx="18" ry="18" />
          <text class="node-role" x="18" y="18">${escapeHtml(roleLabel)}</text>
          <text class="node-title" x="18" y="42">
            ${titleLines.map((line) => `<tspan x="18" dy="0">${escapeHtml(line)}</tspan>`).join("")}
          </text>
          <text class="node-subtitle" x="18" y="62">
            ${subtitleLines.map((line, index) => `<tspan x="18" dy="${index === 0 ? 0 : 15}">${escapeHtml(line)}</tspan>`).join("")}
          </text>
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
          <div class="diagram-legend">${legendMarkup}</div>
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
          <g class="lane-labels">${laneLabelMarkup}</g>
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

function buildPreviewScript(): string {
  return `
    <script>
      const vscode = acquireVsCodeApi();

      const revealNode = (element) => {
        const line = Number(element?.dataset?.line);
        const column = Number(element?.dataset?.column ?? 1);
        if (!Number.isFinite(line) || !Number.isFinite(column)) {
          return;
        }
        vscode.postMessage({ type: "revealLocation", line, column });
      };

      document.addEventListener("click", (event) => {
        const node = event.target.closest(".node[data-line]");
        if (node) {
          revealNode(node);
        }
      });

      document.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        const node = event.target.closest(".node[data-line]");
        if (node) {
          event.preventDefault();
          revealNode(node);
        }
      });
    </script>
  `;
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
        min-width: 760px;
        height: auto;
      }
      .lane-label {
        fill: color-mix(in srgb, var(--vscode-descriptionForeground) 92%, transparent);
        font-size: 11px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }
      .diagram-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 14px;
      }
      .legend-chip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 70%, transparent);
        font-size: 12px;
        color: var(--vscode-editor-foreground);
      }
      .legend-dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: currentColor;
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
        transition: transform 120ms ease, filter 120ms ease, stroke-width 120ms ease;
      }
      .node-title,
      .node-role,
      .node-subtitle {
        fill: var(--vscode-editor-foreground);
        font-family: var(--vscode-font-family);
      }
      .node-role {
        font-size: 10px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        fill: color-mix(in srgb, var(--vscode-editor-foreground) 62%, transparent);
      }
      .node[data-line] {
        cursor: pointer;
      }
      .node[data-line]:focus {
        outline: none;
      }
      .node[data-line]:hover rect,
      .node[data-line]:focus rect {
        stroke-width: 1.8;
        filter: brightness(1.06);
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
      .legend-premise {
        color: var(--vscode-charts-blue);
      }
      .node-evidence rect {
        fill: color-mix(in srgb, var(--vscode-charts-green) 18%, var(--vscode-editor-background));
        stroke: color-mix(in srgb, var(--vscode-charts-green) 65%, transparent);
      }
      .legend-evidence {
        color: var(--vscode-charts-green);
      }
      .node-viewpoint rect {
        fill: color-mix(in srgb, var(--vscode-charts-yellow) 18%, var(--vscode-editor-background));
        stroke: color-mix(in srgb, var(--vscode-charts-yellow) 65%, transparent);
      }
      .legend-viewpoint {
        color: var(--vscode-charts-yellow);
      }
      .node-partition rect {
        fill: color-mix(in srgb, var(--vscode-charts-orange) 18%, var(--vscode-editor-background));
        stroke: color-mix(in srgb, var(--vscode-charts-orange) 65%, transparent);
      }
      .legend-partition {
        color: var(--vscode-charts-orange);
      }
      .node-decision rect {
        fill: color-mix(in srgb, var(--vscode-charts-purple) 18%, var(--vscode-editor-background));
        stroke: color-mix(in srgb, var(--vscode-charts-purple) 65%, transparent);
      }
      .legend-decision {
        color: var(--vscode-charts-purple);
      }
      .node-pending rect {
        fill: color-mix(in srgb, var(--vscode-editorWarning-foreground) 16%, var(--vscode-editor-background));
        stroke: color-mix(in srgb, var(--vscode-editorWarning-foreground) 60%, transparent);
      }
      .legend-pending {
        color: var(--vscode-editorWarning-foreground);
      }
      .node-external rect {
        fill: color-mix(in srgb, var(--vscode-disabledForeground) 14%, var(--vscode-editor-background));
        stroke: color-mix(in srgb, var(--vscode-disabledForeground) 65%, transparent);
        stroke-dasharray: 6 4;
      }
      .legend-external {
        color: var(--vscode-disabledForeground);
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
    ${buildPreviewScript()}
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