import ELK from "elkjs/lib/elk.bundled.js";
import {
  ParseError,
  parseDocument,
  type Annotation,
  type DocumentAst,
  type FrameworkRule,
  type ProblemDecl,
  type StepDecl,
  type StepStatement,
} from "../../dist/index.js";
import {
  getPreviewStrings,
  type DiagramRole,
  type PreviewLocale,
} from "./i18n";

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

interface DiagramPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ElkPoint {
  x: number;
  y: number;
}

interface ElkLayoutNode {
  id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  children?: ElkLayoutNode[];
  ports?: Array<{ id: string; x?: number; y?: number; width?: number; height?: number }>;
}

interface ElkLayoutEdge {
  id: string;
  sections?: Array<{
    startPoint?: ElkPoint;
    bendPoints?: ElkPoint[];
    endPoint?: ElkPoint;
  }>;
}

const elk = new ELK();

const DIAGRAM_ROLE_ORDER: DiagramRole[] = [
  "premise",
  "evidence",
  "viewpoint",
  "partition",
  "decision",
  "pending",
  "external",
];

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

function formatProblem(
  problem: ProblemDecl,
  annotationLabel: string,
): string[] {
  return [
    `### ${problem.name}`,
    "",
    problem.text,
    ...problem.annotations.map((annotation) =>
      `- ${annotationLabel}: ${formatAnnotationLabel(annotation)}`,
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

function formatStep(step: StepDecl, annotationLabel: string): string[] {
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
        `- ${annotationLabel}: ${formatAnnotationLabel(annotation)}`,
      ),
    );
  }

  lines.push("");
  return lines;
}

function buildReferenceSection(document: DocumentAst, title: string, emptyLabel: string): string[] {
  const edges = document.steps.flatMap((step) => {
    if (step.statement.role !== "decision" || step.statement.basedOn.length === 0) {
      return [];
    }
    return step.statement.basedOn.map((source) => `- ${source} -> ${step.statement.id}`);
  });

  if (edges.length === 0) {
    return [`## ${title}`, "", emptyLabel, ""];
  }

  return [`## ${title}`, "", ...edges, ""];
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
      subtitle: formatStatementSummary(step.statement),
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
      subtitle: "__UNRESOLVED_REFERENCE__",
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

function buildOrthogonalPath(points: ElkPoint[]): string {
  if (points.length === 0) {
    return "";
  }

  const [first, ...rest] = points;
  return rest.reduce((path, point) => `${path} L ${point.x} ${point.y}`, `M ${first.x} ${first.y}`);
}

function roleSortIndex(role: DiagramRole): number {
  const index = DIAGRAM_ROLE_ORDER.indexOf(role);
  return index === -1 ? DIAGRAM_ROLE_ORDER.length : index;
}

function renderDiagramIcon(action: string): string {
  switch (action) {
    case "zoom-out":
      return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 12h12" /></svg>';
    case "zoom-in":
      return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 6v12M6 12h12" /></svg>';
    case "reset":
      return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12a7 7 0 1 0 2.05-4.95" /><path d="M5 5v4h4" /></svg>';
    case "fit":
      return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5H5v3" /><path d="M16 5h3v3" /><path d="M8 19H5v-3" /><path d="M16 19h3v-3" /><path d="M9 9h6v6H9z" /></svg>';
    default:
      return "";
  }
}

function portId(nodeId: string, side: "in" | "out", index: number): string {
  return `${nodeId}__${side}_${index}`;
}

async function computeElkLayout(nodes: DiagramNode[], edges: DiagramEdge[]): Promise<{
  nodePositions: Map<string, DiagramPosition>;
  edgeSections: Map<string, ElkLayoutEdge["sections"]>;
  width: number;
  height: number;
}> {
  const nodeWidth = 236;
  const nodeHeight = 96;
  const incomingEdgesByNode = new Map<string, number[]>();
  const outgoingEdgesByNode = new Map<string, number[]>();

  for (const [index, edge] of edges.entries()) {
    const incoming = incomingEdgesByNode.get(edge.to) ?? [];
    incoming.push(index);
    incomingEdgesByNode.set(edge.to, incoming);

    const outgoing = outgoingEdgesByNode.get(edge.from) ?? [];
    outgoing.push(index);
    outgoingEdgesByNode.set(edge.from, outgoing);
  }

  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.spacing.nodeNodeBetweenLayers": "96",
      "elk.spacing.nodeNode": "36",
      "elk.padding": "[top=28,left=28,bottom=24,right=28]",
      "org.eclipse.elk.partitioning.activate": "true",
    },
    children: nodes.map((node) => ({
      id: node.key,
      width: nodeWidth,
      height: nodeHeight,
      layoutOptions: {
        "org.eclipse.elk.partitioning.partition": String(roleSortIndex(node.role)),
        "org.eclipse.elk.portConstraints": "FIXED_SIDE",
      },
      ports: [
        ...(incomingEdgesByNode.get(node.key) ?? [0]).map((edgeIndex) => ({
          id: portId(node.key, "in", edgeIndex),
          width: 8,
          height: 8,
          layoutOptions: {
            "org.eclipse.elk.port.side": "WEST",
          },
        })),
        ...(outgoingEdgesByNode.get(node.key) ?? [0]).map((edgeIndex) => ({
          id: portId(node.key, "out", edgeIndex),
          width: 8,
          height: 8,
          layoutOptions: {
            "org.eclipse.elk.port.side": "EAST",
          },
        })),
      ],
    })),
    edges: edges.map((edge, index) => ({
      id: `edge-${index}-${edge.from}-${edge.to}`,
      sources: [portId(edge.from, "out", index)],
      targets: [portId(edge.to, "in", index)],
    })),
  };

  const layout = await elk.layout(graph as never);
  const nodePositions = new Map<string, DiagramPosition>();
  const edgeSections = new Map<string, ElkLayoutEdge["sections"]>();

  for (const child of ((layout as ElkLayoutNode).children ?? [])) {
    if (
      child.id &&
      typeof child.x === "number" &&
      typeof child.y === "number" &&
      typeof child.width === "number" &&
      typeof child.height === "number"
    ) {
      nodePositions.set(child.id, {
        x: child.x,
        y: child.y,
        width: child.width,
        height: child.height,
      });
    }
  }

  for (const edge of (((layout as unknown) as { edges?: ElkLayoutEdge[] }).edges ?? [])) {
    edgeSections.set(edge.id, edge.sections);
  }

  return {
    nodePositions,
    edgeSections,
    width: Math.max(760, Math.ceil(((layout as ElkLayoutNode).width ?? 760))),
    height: Math.ceil(((layout as ElkLayoutNode).height ?? 320)),
  };
}

async function buildSvgOverview(document: DocumentAst, locale: PreviewLocale): Promise<string> {
  const { nodes, edges } = buildDiagramData(document);
  const strings = getPreviewStrings(locale);

  if (nodes.length === 0) {
    return `
      <section class="diagram-card empty-state">
        <div class="section-header">
          <div>
            <p class="section-kicker">${escapeHtml(strings.diagramKicker)}</p>
            <h2>${escapeHtml(strings.diagramTitle)}</h2>
          </div>
        </div>
        <p>${escapeHtml(strings.diagramEmpty)}</p>
      </section>
    `;
  }

  const { nodePositions, edgeSections, width, height } = await computeElkLayout(nodes, edges);
  const usedRoles = DIAGRAM_ROLE_ORDER.filter((role) =>
    nodes.some((node) => node.role === role),
  );

  const edgeMarkup = edges
    .map((edge, index) => {
      const edgeId = `edge-${index}-${edge.from}-${edge.to}`;
      const sections = edgeSections.get(edgeId);
      const points = sections?.flatMap((section) => {
        const route: ElkPoint[] = [];
        if (section.startPoint) {
          route.push(section.startPoint);
        }
        if (section.bendPoints) {
          route.push(...section.bendPoints);
        }
        if (section.endPoint) {
          route.push(section.endPoint);
        }
        return route;
      }) ?? [];

      if (points.length === 0) {
        return "";
      }

      return `<path class="edge" d="${buildOrthogonalPath(points)}" />`;
    })
    .join("\n");

  const legendMarkup = usedRoles
    .map((role) => {
      return `
        <span class="legend-chip legend-${role}">
          <span class="legend-dot"></span>
          ${escapeHtml(strings.roleLabels[role])}
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
      const subtitle = node.subtitle === "__UNRESOLVED_REFERENCE__"
        ? strings.unresolvedReference
        : node.subtitle;
      const dataAttributes = node.line && node.column
        ? `data-line="${node.line}" data-column="${node.column}" data-node-key="${escapeHtml(node.key)}" tabindex="0" role="button" aria-label="Reveal ${escapeHtml(node.key)} in source"`
        : "";
      return `
        <g class="node node-${node.role}" transform="translate(${layoutNode.x}, ${layoutNode.y})" ${dataAttributes}>
          <rect width="${layoutNode.width}" height="${layoutNode.height}" rx="18" ry="18" />
          <foreignObject x="16" y="14" width="${layoutNode.width - 32}" height="${layoutNode.height - 28}" class="node-copy-wrap">
            <div xmlns="http://www.w3.org/1999/xhtml" class="node-copy"><span class="node-copy-key">${escapeHtml(node.title)}:</span> ${escapeHtml(subtitle)}</div>
          </foreignObject>
        </g>
      `;
    })
    .join("\n");

  const minimapNodeMarkup = nodes
    .map((node) => {
      const layoutNode = nodePositions.get(node.key);
      if (!layoutNode) {
        return "";
      }
      return `
        <g class="minimap-node minimap-node-${node.role}" transform="translate(${layoutNode.x}, ${layoutNode.y})" data-target-node="${escapeHtml(node.key)}">
          <rect width="${layoutNode.width}" height="${layoutNode.height}" rx="10" ry="10" />
        </g>
      `;
    })
    .join("\n");

  return `
    <section class="diagram-card">
      <div class="section-header">
        <div>
          <p class="section-kicker">${escapeHtml(strings.diagramKicker)}</p>
          <h2>${escapeHtml(strings.diagramTitle)}</h2>
          <div class="diagram-legend">${legendMarkup}</div>
        </div>
        <p class="section-meta">${escapeHtml(strings.nodesAndEdges(nodes.length, edges.length))}</p>
      </div>
      <div class="diagram-shell">
        <div class="diagram-viewport">
          <div class="diagram-scroll" data-base-width="${width}" data-base-height="${height}">
            <div class="diagram-stage">
              <svg class="diagram" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="LLMThink step relationship graph">
                <defs>
                  <marker id="arrowhead" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
                    <path d="M 0 0 L 10 4 L 0 8 z" class="arrowhead" />
                  </marker>
                </defs>
                <g class="edges">${edgeMarkup}</g>
                <g class="nodes">${nodeMarkup}</g>
              </svg>
            </div>
          </div>
          <aside class="diagram-minimap-card" aria-label="${escapeHtml(strings.minimap.title)}">
            <div class="diagram-minimap-header" data-drag-handle="true">
              <div class="diagram-minimap-title">${escapeHtml(strings.minimap.title)}</div>
              <output class="diagram-zoom-level" aria-live="polite">${escapeHtml(strings.diagramControls.zoomLevel(100))}</output>
            </div>
            <svg class="diagram-minimap" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(strings.minimap.title)}">
              <g class="minimap-edges">${edgeMarkup}</g>
              <g class="minimap-nodes">${minimapNodeMarkup}</g>
              <rect class="minimap-viewport" x="0" y="0" width="0" height="0">
                <title>${escapeHtml(strings.minimap.viewport)}</title>
              </rect>
            </svg>
            <div class="diagram-hud">
              <p class="diagram-hint">${escapeHtml(strings.diagramControls.dragHint)}</p>
              <div class="diagram-controls" role="toolbar" aria-label="${escapeHtml(strings.diagramTitle)} controls">
                <button type="button" class="diagram-button" data-action="zoom-out" aria-label="${escapeHtml(strings.diagramControls.zoomOut)}">${renderDiagramIcon("zoom-out")}</button>
                <button type="button" class="diagram-button" data-action="zoom-in" aria-label="${escapeHtml(strings.diagramControls.zoomIn)}">${renderDiagramIcon("zoom-in")}</button>
                <button type="button" class="diagram-button" data-action="reset" aria-label="${escapeHtml(strings.diagramControls.reset)}">${renderDiagramIcon("reset")}</button>
                <button type="button" class="diagram-button" data-action="fit" aria-label="${escapeHtml(strings.diagramControls.fit)}">${renderDiagramIcon("fit")}</button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  `;
}

function buildPreviewMarkdown(document: DocumentAst, title: string, locale: PreviewLocale): string {
  const strings = getPreviewStrings(locale);
  const lines: string[] = [`# ${title}`, ""];

  if (document.framework) {
    lines.push(`## ${strings.sections.framework}`, "");
    lines.push(`- ${document.framework.name}`);
    lines.push(...document.framework.rules.map((rule) => `- ${formatFrameworkRule(rule)}`));
    lines.push("");
  }

  if (document.domains.length > 0) {
    lines.push(`## ${strings.sections.domains}`, "");
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
    lines.push(`## ${strings.sections.problems}`, "");
    lines.push(
      ...document.problems.flatMap((problem) => formatProblem(problem, strings.annotationLabel)),
    );
  }

  if (document.steps.length > 0) {
    lines.push(`## ${strings.sections.steps}`, "");
    lines.push(
      ...document.steps.flatMap((step) => formatStep(step, strings.annotationLabel)),
    );
  }

  if (document.queries.length > 0) {
    lines.push(`## ${strings.sections.queries}`, "");
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

  lines.push(
    ...buildReferenceSection(document, strings.sections.references, strings.noBasedOnEdges),
  );
  return lines.join("\n");
}

function buildErrorHtml(error: ParseError | Error, title: string, locale: PreviewLocale): string {
  const strings = getPreviewStrings(locale);
  const message = error instanceof ParseError
    ? `${error.message} (line ${error.line}, column ${error.column})`
    : error.message;
  return `<!DOCTYPE html>
<html lang="${locale}">
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
      <p>${escapeHtml(strings.previewError)}</p>
      <pre><code>${escapeHtml(message)}</code></pre>
    </div>
  </body>
</html>`;
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

      const clampZoom = (value) => Math.min(2.5, Math.max(0.35, Number(value.toFixed(2))));

      document.querySelectorAll(".diagram-card").forEach((card) => {
        const scroll = card.querySelector(".diagram-scroll");
        const svg = card.querySelector(".diagram");
        const zoomLevel = card.querySelector(".diagram-zoom-level");
        const minimap = card.querySelector(".diagram-minimap");
        const minimapViewport = card.querySelector(".minimap-viewport");
        const minimapCard = card.querySelector(".diagram-minimap-card");
        const minimapHandle = card.querySelector("[data-drag-handle='true']");
        const viewport = card.querySelector(".diagram-viewport");
        if (!(scroll instanceof HTMLElement) || !(svg instanceof SVGElement)) {
          return;
        }

        const baseWidth = Number(scroll.dataset.baseWidth || 0);
        const baseHeight = Number(scroll.dataset.baseHeight || 0);
        let zoom = 1;
        let dragState = undefined;
        let minimapDragState = undefined;
        let selectedNode = undefined;

        const clampMinimapPosition = (left, top) => {
          if (!(minimapCard instanceof HTMLElement) || !(viewport instanceof HTMLElement)) {
            return { left, top };
          }
          const maxLeft = Math.max(viewport.clientWidth - minimapCard.offsetWidth - 10, 10);
          const maxTop = Math.max(viewport.clientHeight - minimapCard.offsetHeight - 10, 10);
          return {
            left: Math.min(Math.max(left, 10), maxLeft),
            top: Math.min(Math.max(top, 10), maxTop),
          };
        };

        const placeMinimap = (left, top) => {
          if (!(minimapCard instanceof HTMLElement)) {
            return;
          }
          const next = clampMinimapPosition(left, top);
          minimapCard.style.left = String(next.left) + "px";
          minimapCard.style.top = String(next.top) + "px";
          minimapCard.style.right = "auto";
        };

        const selectNode = (nodeKey) => {
          selectedNode = nodeKey;
          card.querySelectorAll(".node.selected, .minimap-node.selected").forEach((element) => {
            element.classList.remove("selected");
          });
          if (!nodeKey) {
            return;
          }
          const escapedKey = CSS.escape(nodeKey);
          card.querySelectorAll('.node[data-node-key="' + escapedKey + '"] , .minimap-node[data-target-node="' + escapedKey + '"]').forEach((element) => {
            element.classList.add("selected");
          });
        };

        const updateZoomLabel = () => {
          if (zoomLevel instanceof HTMLOutputElement) {
            zoomLevel.value = String(Math.round(zoom * 100)) + "%";
            zoomLevel.textContent = zoomLevel.value;
          }
        };

        const updateMinimapViewport = () => {
          if (!(minimap instanceof SVGElement) || !(minimapViewport instanceof SVGRectElement)) {
            return;
          }

          const scrollRect = scroll.getBoundingClientRect();
          const svgRect = svg.getBoundingClientRect();
          const visibleLeft = Math.max(scrollRect.left, svgRect.left);
          const visibleTop = Math.max(scrollRect.top, svgRect.top);
          const visibleRight = Math.min(scrollRect.right, svgRect.right);
          const visibleBottom = Math.min(scrollRect.bottom, svgRect.bottom);
          const visibleWidth = Math.max(visibleRight - visibleLeft, 0);
          const visibleHeight = Math.max(visibleBottom - visibleTop, 0);
          const offsetX = Math.max(visibleLeft - svgRect.left, 0);
          const offsetY = Math.max(visibleTop - svgRect.top, 0);

          minimapViewport.setAttribute("x", String(offsetX / zoom));
          minimapViewport.setAttribute("y", String(offsetY / zoom));
          minimapViewport.setAttribute("width", String(visibleWidth / zoom));
          minimapViewport.setAttribute("height", String(visibleHeight / zoom));
        };

        const centerNodeInViewport = (nodeElement) => {
          if (!(nodeElement instanceof SVGGElement)) {
            return;
          }
          const svgRect = svg.getBoundingClientRect();
          const nodeRect = nodeElement.getBoundingClientRect();
          const nodeCenterX = nodeRect.left - svgRect.left + nodeRect.width / 2;
          const nodeCenterY = nodeRect.top - svgRect.top + nodeRect.height / 2;
          scroll.scrollLeft = Math.max(nodeCenterX - scroll.clientWidth / 2, 0);
          scroll.scrollTop = Math.max(nodeCenterY - scroll.clientHeight / 2, 0);
          requestAnimationFrame(updateMinimapViewport);
        };

        const centerViewport = () => {
          const maxLeft = Math.max(svg.clientWidth - scroll.clientWidth, 0);
          const maxTop = Math.max(svg.clientHeight - scroll.clientHeight, 0);
          scroll.scrollLeft = maxLeft / 2;
          scroll.scrollTop = maxTop;
          requestAnimationFrame(updateMinimapViewport);
        };

        const applyZoom = (nextZoom, { center = true } = {}) => {
          zoom = clampZoom(nextZoom);
          svg.style.width = String(baseWidth * zoom) + "px";
          svg.style.height = String(baseHeight * zoom) + "px";
          updateZoomLabel();
          if (center) {
            requestAnimationFrame(centerViewport);
          } else {
            requestAnimationFrame(updateMinimapViewport);
          }
        };

        const fitToViewport = () => {
          const horizontal = (scroll.clientWidth - 10) / baseWidth;
          const vertical = (scroll.clientHeight - 10) / baseHeight;
          applyZoom(Math.min(horizontal, vertical), { center: true });
        };

        const initializeMinimapPosition = () => {
          if (!(minimapCard instanceof HTMLElement) || !(viewport instanceof HTMLElement)) {
            return;
          }
          const left = viewport.clientWidth - minimapCard.offsetWidth - 10;
          placeMinimap(left, 10);
        };

        scroll.addEventListener("scroll", () => {
          requestAnimationFrame(updateMinimapViewport);
        });

        card.querySelectorAll(".diagram-button").forEach((button) => {
          button.addEventListener("click", () => {
            const action = button.dataset.action;
            if (action === "zoom-in") {
              applyZoom(zoom + 0.15);
              return;
            }
            if (action === "zoom-out") {
              applyZoom(zoom - 0.15);
              return;
            }
            if (action === "reset") {
              applyZoom(1);
              return;
            }
            if (action === "fit") {
              fitToViewport();
            }
          });
        });

        scroll.addEventListener("pointerdown", (event) => {
          if (event.button !== 0 || event.target.closest(".node[data-line]")) {
            return;
          }
          dragState = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            scrollLeft: scroll.scrollLeft,
            scrollTop: scroll.scrollTop,
          };
          scroll.setPointerCapture(event.pointerId);
          scroll.classList.add("dragging");
        });

        scroll.addEventListener("pointermove", (event) => {
          if (!dragState || dragState.pointerId !== event.pointerId) {
            return;
          }
          scroll.scrollLeft = dragState.scrollLeft - (event.clientX - dragState.startX);
          scroll.scrollTop = dragState.scrollTop - (event.clientY - dragState.startY);
        });

        const stopDragging = (event) => {
          if (!dragState || dragState.pointerId !== event.pointerId) {
            return;
          }
          dragState = undefined;
          scroll.classList.remove("dragging");
          if (scroll.hasPointerCapture(event.pointerId)) {
            scroll.releasePointerCapture(event.pointerId);
          }
        };

        scroll.addEventListener("pointerup", stopDragging);
        scroll.addEventListener("pointercancel", stopDragging);
        scroll.addEventListener("dblclick", () => fitToViewport());

        const stopMinimapDragging = (event) => {
          if (!minimapDragState || minimapDragState.pointerId !== event.pointerId) {
            return;
          }
          minimapDragState = undefined;
          minimapCard?.classList.remove("dragging");
          if (minimapHandle instanceof HTMLElement && minimapHandle.hasPointerCapture(event.pointerId)) {
            minimapHandle.releasePointerCapture(event.pointerId);
          }
        };

        if (minimapHandle instanceof HTMLElement && minimapCard instanceof HTMLElement) {
          minimapHandle.addEventListener("pointerdown", (event) => {
            if (event.button !== 0) {
              return;
            }
            const cardRect = minimapCard.getBoundingClientRect();
            const viewportRect = viewport instanceof HTMLElement ? viewport.getBoundingClientRect() : { left: 0, top: 0 };
            minimapDragState = {
              pointerId: event.pointerId,
              offsetX: event.clientX - cardRect.left,
              offsetY: event.clientY - cardRect.top,
              shellLeft: viewportRect.left,
              shellTop: viewportRect.top,
            };
            minimapHandle.setPointerCapture(event.pointerId);
            minimapCard.classList.add("dragging");
            event.preventDefault();
          });

          minimapHandle.addEventListener("pointermove", (event) => {
            if (!minimapDragState || minimapDragState.pointerId !== event.pointerId) {
              return;
            }
            placeMinimap(
              event.clientX - minimapDragState.shellLeft - minimapDragState.offsetX,
              event.clientY - minimapDragState.shellTop - minimapDragState.offsetY,
            );
          });

          minimapHandle.addEventListener("pointerup", stopMinimapDragging);
          minimapHandle.addEventListener("pointercancel", stopMinimapDragging);
        }

        window.addEventListener("resize", () => {
          if (!(minimapCard instanceof HTMLElement)) {
            return;
          }
          placeMinimap(minimapCard.offsetLeft, minimapCard.offsetTop);
          requestAnimationFrame(updateMinimapViewport);
        });

        card.querySelectorAll(".node[data-line]").forEach((node) => {
          node.addEventListener("click", () => {
            const nodeKey = node.getAttribute("data-node-key") || undefined;
            selectNode(nodeKey);
            centerNodeInViewport(node);
          });
        });

        if (minimap instanceof SVGElement) {
          minimap.addEventListener("click", (event) => {
            const target = event.target.closest(".minimap-node");
            if (!(target instanceof SVGGElement)) {
              return;
            }
            const nodeKey = target.getAttribute("data-target-node") || undefined;
            if (!nodeKey) {
              return;
            }
            selectNode(nodeKey);
            const mainNode = card.querySelector('.node[data-node-key="' + CSS.escape(nodeKey) + '"]');
            if (mainNode instanceof SVGGElement) {
              centerNodeInViewport(mainNode);
            }
          });
        }

        applyZoom(1, { center: false });
        requestAnimationFrame(initializeMinimapPosition);
        requestAnimationFrame(fitToViewport);
      });
    </script>
  `;
}

function buildPreviewHtml(markdown: string, title: string, svgOverview: string, locale: PreviewLocale): string {
  const strings = getPreviewStrings(locale);
  return `<!DOCTYPE html>
<html lang="${locale}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      :root {
        color-scheme: light dark;
      }
      body {
        margin: 0;
        padding: 18px;
        font-family: var(--vscode-font-family);
        color: var(--vscode-editor-foreground);
        background:
          radial-gradient(circle at top right, color-mix(in srgb, var(--vscode-button-background) 16%, transparent), transparent 30%),
          linear-gradient(180deg, color-mix(in srgb, var(--vscode-editor-background) 94%, black 6%), var(--vscode-editor-background));
      }
      .layout {
        max-width: min(1480px, calc(100vw - 24px));
        margin: 0 auto;
        display: grid;
        gap: 14px;
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
        padding: 20px 22px;
      }
      .diagram-card,
      .markdown {
        padding: 18px;
      }
      .diagram-card {
        width: min(100%, 1120px);
        justify-self: center;
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
        margin-bottom: 10px;
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
      .diagram-controls {
        display: flex;
        gap: 6px;
        align-items: center;
      }
      .diagram-button {
        width: 28px;
        height: 28px;
        border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 28%, transparent);
        background: color-mix(in srgb, var(--vscode-editor-background) 54%, transparent);
        color: color-mix(in srgb, var(--vscode-editor-foreground) 52%, transparent);
        border-radius: 999px;
        padding: 0;
        font: inherit;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        opacity: 0.22;
        transition: opacity 120ms ease, background 120ms ease, border-color 120ms ease, transform 120ms ease;
      }
      .diagram-button:hover,
      .diagram-button:focus-visible,
      .diagram-minimap-card:hover .diagram-button {
        opacity: 0.58;
        background: color-mix(in srgb, var(--vscode-editor-background) 76%, transparent);
        border-color: color-mix(in srgb, var(--vscode-focusBorder) 36%, transparent);
      }
      .diagram-button svg {
        width: 14px;
        height: 14px;
        stroke: currentColor;
        fill: none;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .diagram-zoom-level {
        min-width: 56px;
        color: color-mix(in srgb, var(--vscode-descriptionForeground) 82%, transparent);
        text-align: right;
        font-size: 11px;
      }
      .diagram-hint {
        margin: 0;
        color: color-mix(in srgb, var(--vscode-descriptionForeground) 72%, transparent);
        font-size: 10px;
        opacity: 0.18;
        transition: opacity 120ms ease;
      }
      .diagram-scroll {
        overflow: auto;
        width: 100%;
        height: 100%;
        cursor: grab;
      }
      .diagram-scroll.dragging {
        cursor: grabbing;
      }
      .diagram-shell {
        position: relative;
      }
      .diagram-viewport {
        position: relative;
        overflow: hidden;
        width: min(100%, 1080px);
        margin: 0 auto;
        max-height: min(64vh, 720px);
        min-height: clamp(320px, 50vh, 520px);
        border-radius: 14px;
        border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 72%, transparent);
        background: color-mix(in srgb, var(--vscode-editor-background) 94%, black 6%);
      }
      .diagram-stage {
        min-width: 100%;
        width: max-content;
        display: flex;
        justify-content: center;
        align-items: flex-start;
        padding: 2px;
      }
      .diagram {
        display: block;
      }
      .diagram-minimap-card {
        border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 72%, transparent);
        border-radius: 14px;
        background: color-mix(in srgb, var(--vscode-editor-background) 72%, transparent);
        backdrop-filter: blur(10px);
        padding: 8px 8px 10px;
        position: absolute;
        top: 10px;
        right: 10px;
        width: min(148px, 24vw);
        box-shadow: 0 10px 32px rgba(0, 0, 0, 0.2);
        opacity: 0.76;
        transition: opacity 120ms ease, box-shadow 120ms ease;
        z-index: 2;
      }
      .diagram-minimap-card:hover,
      .diagram-minimap-card:focus-within,
      .diagram-minimap-card.dragging {
        opacity: 0.94;
        box-shadow: 0 16px 36px rgba(0, 0, 0, 0.26);
      }
      .diagram-minimap-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 6px;
        cursor: grab;
        user-select: none;
      }
      .diagram-minimap-card.dragging .diagram-minimap-header {
        cursor: grabbing;
      }
      .diagram-minimap-title {
        font-size: 10px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: color-mix(in srgb, var(--vscode-descriptionForeground) 88%, transparent);
      }
      .diagram-minimap {
        width: 100%;
        height: auto;
        display: block;
        border-radius: 10px;
        overflow: hidden;
      }
      .minimap-node rect {
        stroke-width: 1;
      }
      .minimap-node-premise rect {
        fill: color-mix(in srgb, var(--vscode-charts-blue) 28%, var(--vscode-editor-background));
        stroke: color-mix(in srgb, var(--vscode-charts-blue) 72%, transparent);
      }
      .minimap-node-evidence rect {
        fill: color-mix(in srgb, var(--vscode-charts-green) 28%, var(--vscode-editor-background));
        stroke: color-mix(in srgb, var(--vscode-charts-green) 72%, transparent);
      }
      .minimap-node-viewpoint rect {
        fill: color-mix(in srgb, var(--vscode-charts-yellow) 28%, var(--vscode-editor-background));
        stroke: color-mix(in srgb, var(--vscode-charts-yellow) 72%, transparent);
      }
      .minimap-node-partition rect {
        fill: color-mix(in srgb, var(--vscode-charts-orange) 28%, var(--vscode-editor-background));
        stroke: color-mix(in srgb, var(--vscode-charts-orange) 72%, transparent);
      }
      .minimap-node-decision rect {
        fill: color-mix(in srgb, var(--vscode-charts-purple) 28%, var(--vscode-editor-background));
        stroke: color-mix(in srgb, var(--vscode-charts-purple) 72%, transparent);
      }
      .minimap-node-pending rect {
        fill: color-mix(in srgb, var(--vscode-editorWarning-foreground) 24%, var(--vscode-editor-background));
        stroke: color-mix(in srgb, var(--vscode-editorWarning-foreground) 68%, transparent);
      }
      .minimap-node-external rect {
        fill: color-mix(in srgb, var(--vscode-disabledForeground) 18%, var(--vscode-editor-background));
        stroke: color-mix(in srgb, var(--vscode-disabledForeground) 68%, transparent);
      }
      .minimap-viewport {
        fill: color-mix(in srgb, var(--vscode-focusBorder) 12%, transparent);
        stroke: var(--vscode-focusBorder);
        stroke-width: 5;
        pointer-events: none;
      }
      .diagram-hud {
        display: grid;
        justify-items: center;
        gap: 6px;
        margin-top: 6px;
      }
      .diagram-minimap-card:hover .diagram-hint,
      .diagram-minimap-card:focus-within .diagram-hint {
        opacity: 0.42;
      }
      .node.selected rect,
      .minimap-node.selected rect {
        stroke: var(--vscode-focusBorder);
        stroke-width: 2.4;
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
        stroke-linejoin: round;
        marker-end: url(#arrowhead);
      }
      .arrowhead {
        fill: color-mix(in srgb, var(--vscode-textLink-foreground) 82%, transparent);
      }
      .node rect {
        stroke-width: 1.2;
        transition: transform 120ms ease, filter 120ms ease, stroke-width 120ms ease;
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
      .node-copy-wrap {
        pointer-events: none;
        overflow: hidden;
      }
      .node-copy {
        font-family: var(--vscode-font-family);
        font-size: 11px;
        line-height: 1.28;
        color: color-mix(in srgb, var(--vscode-editor-foreground) 78%, transparent);
        overflow: hidden;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 4;
        word-break: break-word;
        overflow-wrap: anywhere;
      }
      .node-copy-key {
        color: var(--vscode-editor-foreground);
        font-weight: 700;
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
      @media (max-width: 960px) {
        .diagram-minimap-card {
          width: min(132px, 38vw);
        }
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
        <div class="eyebrow">${escapeHtml(strings.previewName)}</div>
        <h1>${escapeHtml(title)}</h1>
      </section>
      ${svgOverview}
      <section class="markdown">
        ${markdownToHtml(markdown)}
      </section>
    </main>
    ${buildPreviewScript()}
  </body>
</html>`;
}

export async function renderDslPreview(
  text: string,
  title: string,
  locale: PreviewLocale,
): Promise<string> {
  try {
    const document = parseDocument(text);
    const strings = getPreviewStrings(locale);
    for (const node of document.steps) {
      if (node.statement.role === "decision") {
        continue;
      }
    }
    const markdown = buildPreviewMarkdown(document, title, locale);
    const svgOverview = await buildSvgOverview(document, locale);
    const localizedMarkdown = markdown.replaceAll("__UNRESOLVED_REFERENCE__", strings.unresolvedReference);
    return buildPreviewHtml(localizedMarkdown, title, svgOverview, locale);
  } catch (error) {
    if (error instanceof ParseError || error instanceof Error) {
      return buildErrorHtml(error, title, locale);
    }
    return buildErrorHtml(new Error(String(error)), title, locale);
  }
}