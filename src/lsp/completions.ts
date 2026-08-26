import {
  CompletionItemKind,
  InsertTextFormat,
  Position,
} from "vscode-languageserver/node.js";
import type { CompletionItem } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  EDGE_CONFIDENCE_KEYWORDS,
  SOURCE_CONFIDENCE_KEYWORDS,
} from "../model/confidence.js";
import { parseDocument } from "../parser/parser.js";

export interface DslqlCompletionSpec {
  label: string;
  detail: string;
  documentation: string;
  insertText?: string;
  kind?: CompletionItemKind;
}

const ANNOTATION_KINDS = [
  "explanation",
  "rationale",
  "status",
  "caveat",
  "todo",
  "orphan_future",
  "orphan_reference",
] as const;

const COMPARISON_RELATIONS = [
  "preferred_over",
  "weaker_than",
  "incomparable",
  "counterexample_to",
] as const;

const STATEMENT_ROLE_COMPLETIONS = [
  { label: "premise", insertText: "premise ${1:PR1}:" },
  { label: "viewpoint", insertText: "viewpoint ${1:V1}:" },
  {
    label: "partition",
    insertText: "partition ${1:PT1} on ${2:V1}:",
  },
  { label: "evidence", insertText: "evidence ${1:EV1}:" },
  {
    label: "decision",
    insertText: "decision ${1:D1} based_on ${2:REF}:",
  },
  {
    label: "comparison",
    insertText:
      "comparison ${1:C1} on ${2:P1} viewpoint ${3:V1} relation ${4|preferred_over,weaker_than,incomparable,counterexample_to|} ${5:D1}, ${6:D2}:",
  },
  { label: "pending", insertText: "pending ${1:PD1}:" },
] as const;

function lineTextAt(document: TextDocument, line: number): string {
  return document.getText({
    start: Position.create(line, 0),
    end: Position.create(line + 1, 0),
  });
}

function linePrefixAt(document: TextDocument, position: Position): string {
  return document.getText({
    start: Position.create(position.line, 0),
    end: position,
  });
}

function previousSignificantLineText(
  document: TextDocument,
  line: number,
): string | undefined {
  for (let currentLine = line - 1; currentLine >= 0; currentLine -= 1) {
    const text = lineTextAt(document, currentLine);
    const trimmed = text.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    return text;
  }
  return undefined;
}

function isInsideEvidenceBody(
  document: TextDocument,
  line: number,
  childLine: string,
): boolean {
  const childIndent = /^\s*/.exec(childLine)?.[0].length ?? 0;
  for (let currentLine = line - 1; currentLine >= 0; currentLine -= 1) {
    const text = lineTextAt(document, currentLine);
    const trimmed = text.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const indent = /^\s*/.exec(text)?.[0].length ?? 0;
    if (indent >= childIndent) continue;
    return /^evidence\s+[A-Za-z][A-Za-z0-9_-]*\s*:\s*$/.test(trimmed);
  }
  return false;
}

function buildKeywordCompletionItems(
  labels: readonly string[],
  detail: string,
  documentation: Readonly<Record<string, string>>,
  options?: { kind?: CompletionItemKind; insertTextSuffix?: string },
): CompletionItem[] {
  return labels.map((label) => ({
    label,
    kind: options?.kind ?? CompletionItemKind.Keyword,
    detail,
    documentation: documentation[label],
    insertText: `${label}${options?.insertTextSuffix ?? ""}`,
  }));
}

function buildAnnotationHeaderCompletionItems(
  documentation: Readonly<Record<string, string>>,
): CompletionItem[] {
  return ANNOTATION_KINDS.map((label) => ({
    label: `annotation ${label}`,
    kind: CompletionItemKind.Snippet,
    detail: "annotation snippet",
    documentation: documentation[label],
    insertText: `annotation ${label}:`,
  }));
}

function buildEvidenceResourceCompletionItem(
  documentation: Readonly<Record<string, string>>,
): CompletionItem {
  return {
    label: "resource",
    kind: CompletionItemKind.Snippet,
    detail: "evidence resource snippet",
    documentation: documentation.resource,
    insertText: [
      "resource:",
      '  ${1|url,file,blob|} "${2:locator}"',
      '  mime "${3:application/octet-stream}"',
      '  label "${4:evidence resource}"',
    ].join("\n"),
    insertTextFormat: InsertTextFormat.Snippet,
  };
}

function confidenceValueCompletions(
  document: TextDocument,
  position: Position,
  trimmedPrefix: string,
  documentation: Readonly<Record<string, string>>,
): CompletionItem[] | undefined {
  if (/^epistemic(?:\s+[A-Za-z0-9_-]*)?$/.test(trimmedPrefix)) {
    return buildKeywordCompletionItems(
      ["known", "estimated", "unknown"],
      "confidence epistemic tag",
      documentation,
      { kind: CompletionItemKind.EnumMember },
    );
  }
  if (/^keyword(?:\s+[A-Za-z0-9_-]*)?$/.test(trimmedPrefix)) {
    const header = previousSignificantLineText(document, position.line);
    const labels = header?.includes("->")
      ? EDGE_CONFIDENCE_KEYWORDS
      : SOURCE_CONFIDENCE_KEYWORDS;
    return buildKeywordCompletionItems(
      labels,
      "confidence profile keyword",
      documentation,
      { kind: CompletionItemKind.EnumMember },
    );
  }
  return undefined;
}

function isStatementRolePosition(
  document: TextDocument,
  position: Position,
  prefix: string,
  trimmedPrefix: string,
): boolean {
  if (!/^[A-Za-z0-9_-]*$/.test(trimmedPrefix)) {
    return false;
  }
  const indent = /^\s*/.exec(prefix)?.[0].length ?? 0;
  if (indent === 0) {
    return false;
  }
  const previousLine = previousSignificantLineText(document, position.line);
  if (!previousLine) {
    return false;
  }
  const previousIndent = /^\s*/.exec(previousLine)?.[0].length ?? 0;
  return (
    indent > previousIndent &&
    /^step(?:\s+[A-Za-z][A-Za-z0-9_-]*)?\s*:\s*$/.test(previousLine.trim())
  );
}

function buildStatementRoleCompletionItems(
  documentation: Readonly<Record<string, string>>,
): CompletionItem[] {
  return STATEMENT_ROLE_COMPLETIONS.map(({ label, insertText }) => ({
    label,
    kind: CompletionItemKind.Snippet,
    detail: "statement role",
    documentation: documentation[label],
    insertText,
    insertTextFormat: InsertTextFormat.Snippet,
  }));
}

export function buildContextualDslCompletions(
  document: TextDocument,
  position: Position,
  documentation: Readonly<Record<string, string>>,
): CompletionItem[] | undefined {
  const prefix = linePrefixAt(document, position);
  const trimmedPrefix = prefix.trim();

  if (/^annotation(?:\s+[A-Za-z0-9_-]*)?$/.test(trimmedPrefix)) {
    return buildKeywordCompletionItems(
      ANNOTATION_KINDS,
      "annotation kind",
      documentation,
      {
        kind: CompletionItemKind.EnumMember,
        insertTextSuffix: ":",
      },
    );
  }

  if (/^comparison\b.*\brelation(?:\s+[A-Za-z0-9_-]*)?$/.test(trimmedPrefix)) {
    return buildKeywordCompletionItems(
      COMPARISON_RELATIONS,
      "comparison relation",
      documentation,
      {
        kind: CompletionItemKind.EnumMember,
      },
    );
  }

  const confidenceItems = confidenceValueCompletions(
    document,
    position,
    trimmedPrefix,
    documentation,
  );
  if (confidenceItems) return confidenceItems;

  if (isStatementRolePosition(document, position, prefix, trimmedPrefix)) {
    return buildStatementRoleCompletionItems(documentation);
  }

  if (!trimmedPrefix) {
    const previousLine = previousSignificantLineText(document, position.line);
    if (previousLine?.trim().startsWith('"')) {
      const items = buildAnnotationHeaderCompletionItems(documentation);
      if (isInsideEvidenceBody(document, position.line, previousLine)) {
        items.unshift(buildEvidenceResourceCompletionItem(documentation));
      }
      return items;
    }
    if (
      previousLine &&
      /^(?:resource:|(?:url|file|blob|digest|mime|label)\s+")/.test(
        previousLine.trim(),
      )
    ) {
      return buildKeywordCompletionItems(
        ["url", "file", "blob", "digest", "mime", "label"],
        "evidence resource field",
        documentation,
        { kind: CompletionItemKind.Field, insertTextSuffix: ' "' },
      );
    }
  }

  return undefined;
}

export function isDslqlQueryPosition(
  document: TextDocument,
  position: Position,
): boolean {
  try {
    return parseDocument(document.getText()).queries.some(
      (query) =>
        query.expressionSpan.line - 1 === position.line &&
        position.character >= query.expressionSpan.column - 1,
    );
  } catch {
    return false;
  }
}

export function buildDslqlCompletionItems(
  items: readonly DslqlCompletionSpec[],
): CompletionItem[] {
  return items.map((item) => ({
    label: item.label,
    kind: item.kind ?? CompletionItemKind.Function,
    detail: item.detail,
    documentation: item.documentation,
    insertText: item.insertText ?? item.label,
    insertTextFormat: InsertTextFormat.Snippet,
  }));
}
