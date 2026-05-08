import type { StepStatement } from "../../dist/index.js";

export type PreviewLocale = "ja" | "en";
export type DiagramRole = StepStatement["role"] | "external";

interface PreviewStrings {
  previewName: string;
  previewButton: string;
  previewTooltip: string;
  previewMissingEditor: string;
  previewTitle: (title: string) => string;
  diagramKicker: string;
  diagramTitle: string;
  diagramEmpty: string;
  nodesAndEdges: (nodes: number, edges: number) => string;
  diagramControls: {
    zoomIn: string;
    zoomOut: string;
    reset: string;
    fit: string;
    dragHint: string;
    zoomLevel: (percent: number) => string;
  };
  minimap: {
    title: string;
    viewport: string;
  };
  sections: {
    framework: string;
    domains: string;
    problems: string;
    steps: string;
    queries: string;
    references: string;
  };
  noBasedOnEdges: string;
  unresolvedReference: string;
  annotationLabel: string;
  previewError: string;
  roleLabels: Record<DiagramRole, string>;
}

const STRINGS: Record<PreviewLocale, PreviewStrings> = {
  ja: {
    previewName: "LLMThink プレビュー",
    previewButton: "LLMThink プレビュー",
    previewTooltip: "アクティブな DSL 文書をプレビューで開く",
    previewMissingEditor: "プレビュー対象のアクティブエディタがありません。",
    previewTitle: (title) => `LLMThink プレビュー: ${title}`,
    diagramKicker: "SVG グラフ",
    diagramTitle: "ステップマップ",
    diagramEmpty: "構造化された step がまだないため、SVG 図は表示されません。",
    nodesAndEdges: (nodes, edges) => `${nodes} ノード / ${edges} エッジ`,
    diagramControls: {
      zoomIn: "拡大",
      zoomOut: "縮小",
      reset: "100%",
      fit: "フィット",
      dragHint: "ドラッグで移動、スクロールで表示位置を調整できます。",
      zoomLevel: (percent) => `ズーム ${percent}%`,
    },
    minimap: {
      title: "ミニマップ",
      viewport: "現在の表示範囲",
    },
    sections: {
      framework: "Framework",
      domains: "Domains",
      problems: "Problems",
      steps: "Steps",
      queries: "Queries",
      references: "References",
    },
    noBasedOnEdges: "明示的な based_on edge はありません。",
    unresolvedReference: "参照先が未定義です",
    annotationLabel: "注記",
    previewError: "DSL をプレビューできませんでした。",
    roleLabels: {
      premise: "前提",
      evidence: "根拠",
      viewpoint: "観点",
      partition: "分割",
      decision: "判断",
      pending: "保留",
      external: "未解決参照",
    },
  },
  en: {
    previewName: "LLMThink Preview",
    previewButton: "LLMThink Preview",
    previewTooltip: "Open a preview for the active DSL document",
    previewMissingEditor: "There is no active editor to preview.",
    previewTitle: (title) => `LLMThink Preview: ${title}`,
    diagramKicker: "SVG Graph",
    diagramTitle: "Step Map",
    diagramEmpty: "No structured steps are available yet, so the SVG graph cannot be shown.",
    nodesAndEdges: (nodes, edges) => `${nodes} nodes / ${edges} edges`,
    diagramControls: {
      zoomIn: "Zoom in",
      zoomOut: "Zoom out",
      reset: "100%",
      fit: "Fit",
      dragHint: "Drag to pan, or scroll in either direction to move around the map.",
      zoomLevel: (percent) => `Zoom ${percent}%`,
    },
    minimap: {
      title: "Mini-map",
      viewport: "Visible viewport",
    },
    sections: {
      framework: "Framework",
      domains: "Domains",
      problems: "Problems",
      steps: "Steps",
      queries: "Queries",
      references: "References",
    },
    noBasedOnEdges: "No explicit based_on edges.",
    unresolvedReference: "Referenced but not declared",
    annotationLabel: "Annotation",
    previewError: "The DSL preview could not be rendered.",
    roleLabels: {
      premise: "Premises",
      evidence: "Evidence",
      viewpoint: "Viewpoints",
      partition: "Partitions",
      decision: "Decisions",
      pending: "Pending",
      external: "Unresolved refs",
    },
  },
};

export function resolvePreviewLocale(language: string | undefined): PreviewLocale {
  return language?.toLowerCase().startsWith("ja") ? "ja" : "en";
}

export function getPreviewStrings(locale: PreviewLocale): PreviewStrings {
  return STRINGS[locale];
}