#!/usr/bin/env node

import {
  CodeAction,
  CodeActionKind,
  CompletionItemKind,
  DocumentHighlight,
  DocumentHighlightKind,
  DiagnosticSeverity,
  DidChangeConfigurationNotification,
  Hover,
  InitializeParams,
  InitializeResult,
  Location,
  MarkupKind,
  ProposedFeatures,
  SymbolKind,
  TextDocumentSyncKind,
  createConnection,
  InsertTextFormat,
} from "vscode-languageserver/node.js";
import { TextDocuments } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  DocumentSymbol,
  Position,
  Range,
  TextEdit,
  WorkspaceEdit,
} from "vscode-languageserver-types";
import { auditDslText } from "../analyzer/audit.js";
import { formatDslText } from "../dsl/format.js";
import { collectDslqlReferenceIds } from "../dslql/query.js";
import type { AuditIssue } from "../model/diagnostics.js";
import type { DocumentAst, SourceSpan, StepDecl } from "../model/ast.js";
import { ParseError, parseDocument } from "../parser/parser.js";

interface IndexedLocation {
  name: string;
  range: Range;
}

interface SymbolIndex {
  definitions: Map<string, Location>;
  references: Map<string, Location[]>;
  semanticLocations: IndexedLocation[];
}

interface DslqlCompletionSpec {
  label: string;
  detail: string;
  documentation: string;
  insertText?: string;
  kind?: CompletionItemKind;
}

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;

const KEYWORD_DOCS: Record<string, string> = {
  framework: "文書全体の制約や期待役割を宣言します。",
  domain: "評価対象の分類軸や対象領域を定義します。",
  problem: "検討対象の問題文を定義します。",
  annotation: "problem や text-bearing statement に付く構造化注釈を宣言します。",
  explanation: "annotation kind です。補足説明を表します。",
  rationale: "annotation kind です。判断理由や背景説明を表します。",
  caveat: "annotation kind です。注意点や制約を表します。",
  todo: "annotation kind です。後続作業や未完了事項を表します。",
  orphan_future: "annotation kind です。将来扱う intentional orphan を表します。",
  orphan_reference: "annotation kind です。参照用に残す intentional orphan を表します。",
  step: "1 つの推論ステップを表します。",
  premise: "前提を表す step body です。",
  viewpoint: "評価軸を表す step body です。",
  axis: "viewpoint や partition の軸名を示します。",
  partition: "MECE 分割候補を表す step body です。",
  evidence: "根拠を表す step body です。",
  decision: "判断を表す step body です。",
  comparison: "同一 problem / viewpoint 内で decision 同士の相対比較を表す step body です。",
  based_on: "decision の参照根拠を列挙します。",
  relation: "comparison の比較関係を表します。",
  preferred_over: "comparison relation です。左側 decision を右側より優先します。",
  weaker_than: "comparison relation です。左側 decision が右側より弱いことを表します。",
  incomparable: "comparison relation です。2 つの decision を同一軸では順序付けしないことを表します。",
  counterexample_to: "comparison relation です。左側 decision が右側 decision の反例や反証になることを表します。",
  pending: "未解決事項を表す step body です。",
  query: "DSL 文書に対する問い合わせを宣言します。",
  requires: "framework が要求する役割を表します。",
  forbids: "framework が禁止する要素を表します。",
  warns: "framework が注意喚起する要素を表します。",
};

const QUERY_FUNCTION_DOCS: Record<string, string> = {
  related_decisions:
    "problem を引数に取り、関連する decision 候補を返す query 関数です。",
  select: "DSLQL の filter 関数です。条件が真の要素だけを通します。",
  len: "DSLQL の長さ関数です。配列や文字列の長さを返します。",
  map: "DSLQL の map 関数です。各要素に式を適用して新しい stream を作ります。",
  sort_by: "DSLQL の sort_by 関数です。指定式の評価結果で stream を並び替えます。",
  limit: "DSLQL の limit 関数です。stream の先頭 N 件を返します。",
  unique_by: "DSLQL の unique_by 関数です。指定式の評価結果で重複排除します。",
  audit_findings:
    "監査結果から finding stream を取り出す DSLQL 関数です。severity を省略できます。",
  based_on_refs:
    "decision から based_on 参照先の statement stream を引く DSLQL 関数です。",
  upstream: "statement の上流参照を辿る DSLQL 関数です。",
  downstream: "statement の下流参照を辿る DSLQL 関数です。",
  score: "search result の ranking score を返す DSLQL 関数です。",
  kind: "値の正規化後 kind 名を返す DSLQL 関数です。",
  has_open_pending:
    "pending を含むかどうかを返す DSLQL 関数です。thought search の絞り込みに使います。",
};

const DSLQL_IDENTIFIER_DOCS: Record<string, string> = {
  document: "thought runtime 全体の document view です。domains、problems、steps、queries を持ちます。",
  framework: "framework 宣言の root です。",
  domains: "domain 一覧の root stream です。",
  problems: "problem 一覧の root stream です。",
  steps: "step statement 一覧の root stream です。",
  queries: "query 一覧の root stream です。",
  audit: "latest audit result の root です。",
  thought: "thought metadata の root です。",
  search: "thought search result の root stream です。",
  id: "識別子 field です。problem、statement、query などで使われます。",
  role: "statement role field です。decision、evidence、pending などを表します。",
  text: "本文 text field です。problem や statement の説明に使われます。",
  based_on: "decision の参照 ID 一覧 field です。",
  step_id: "statement が属する step の識別子 field です。",
  score: "search result や query projection で使う score field です。",
  source_kind: "draft、final、audit のような source 種別 field です。",
};

const DSLQL_COMPLETIONS: DslqlCompletionSpec[] = [
  {
    label: ".problems[]",
    detail: "DSLQL root",
    documentation: "problem 一覧を stream として展開します。",
    insertText: ".problems[]",
    kind: CompletionItemKind.Field,
  },
  {
    label: ".steps[]",
    detail: "DSLQL root",
    documentation: "step statement 一覧を stream として展開します。",
    insertText: ".steps[]",
    kind: CompletionItemKind.Field,
  },
  {
    label: ".queries[]",
    detail: "DSLQL root",
    documentation: "query 一覧を stream として展開します。",
    insertText: ".queries[]",
    kind: CompletionItemKind.Field,
  },
  {
    label: ".audit",
    detail: "DSLQL root",
    documentation: "latest audit result にアクセスします。",
    insertText: ".audit",
    kind: CompletionItemKind.Field,
  },
  {
    label: "select(...)",
    detail: "DSLQL filter",
    documentation: QUERY_FUNCTION_DOCS.select,
    insertText: 'select(${1:.role == "decision"})',
    kind: CompletionItemKind.Function,
  },
  {
    label: "map(...)",
    detail: "DSLQL transform",
    documentation: QUERY_FUNCTION_DOCS.map,
    insertText: "map(${1:{id: .id, text: .text}})",
    kind: CompletionItemKind.Function,
  },
  {
    label: "sort_by(...)",
    detail: "DSLQL transform",
    documentation: QUERY_FUNCTION_DOCS.sort_by,
    insertText: "sort_by(${1:.id})",
    kind: CompletionItemKind.Function,
  },
  {
    label: "unique_by(...)",
    detail: "DSLQL transform",
    documentation: QUERY_FUNCTION_DOCS.unique_by,
    insertText: "unique_by(${1:.id})",
    kind: CompletionItemKind.Function,
  },
  {
    label: "limit(...)",
    detail: "DSLQL transform",
    documentation: QUERY_FUNCTION_DOCS.limit,
    insertText: "limit(${1:10})",
    kind: CompletionItemKind.Function,
  },
  {
    label: "related_decisions",
    detail: "DSLQL relation",
    documentation: QUERY_FUNCTION_DOCS.related_decisions,
    insertText: "related_decisions",
    kind: CompletionItemKind.Function,
  },
  {
    label: "audit_findings(...)",
    detail: "DSLQL relation",
    documentation: QUERY_FUNCTION_DOCS.audit_findings,
    insertText: 'audit_findings(${1:"warning"})',
    kind: CompletionItemKind.Function,
  },
  {
    label: "len(...)",
    detail: "DSLQL helper",
    documentation: QUERY_FUNCTION_DOCS.len,
    insertText: "len(${1:.})",
    kind: CompletionItemKind.Function,
  },
  {
    label: "query by problem",
    detail: "DSLQL snippet",
    documentation: "problem を起点に related_decisions を引く基本パターンです。",
    insertText:
      '.problems[] | select(.id == "${1:P1}") | related_decisions | ${2:map({id: .id, text: .text})}',
    kind: CompletionItemKind.Snippet,
  },
  {
    label: "audit warnings",
    detail: "DSLQL snippet",
    documentation: "warning 以上の audit finding を束ねる基本パターンです。",
    insertText: '.audit | audit_findings("${1:warning}") | [.] | {count: len(.), findings: .}',
    kind: CompletionItemKind.Snippet,
  },
];

function toRange(span: SourceSpan, endColumn?: number): Range {
  return {
    start: { line: span.line - 1, character: span.column - 1 },
    end: { line: span.line - 1, character: endColumn ?? span.column },
  };
}

function fullDocumentRange(document: TextDocument): Range {
  const lastLine = Math.max(document.lineCount - 1, 0);
  const lastLineText = lineTextAt(document, lastLine);
  return {
    start: Position.create(0, 0),
    end: Position.create(lastLine, lastLineText.length),
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lineTextAt(document: TextDocument, line: number): string {
  return document.getText({
    start: Position.create(line, 0),
    end: Position.create(line + 1, 0),
  });
}

function identifierRangeOnLine(
  lineText: string,
  line: number,
  identifier: string,
  startCharacter = 0,
): Range | undefined {
  const pattern = new RegExp(`\\b${escapeRegExp(identifier)}\\b`, "g");
  pattern.lastIndex = startCharacter;
  const match = pattern.exec(lineText);
  if (!match || match.index === undefined) {
    return undefined;
  }
  return Range.create(
    Position.create(line, match.index),
    Position.create(line, match.index + identifier.length),
  );
}

function tokenizeRuleValue(value: string): string[] {
  return value
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && token !== "and" && token !== "or");
}

function extractQueryArguments(expression: string): string[] {
  try {
    return collectDslqlReferenceIds(expression);
  } catch {
    return [];
  }
}

function createSymbolIndex(): SymbolIndex {
  return {
    definitions: new Map<string, Location>(),
    references: new Map<string, Location[]>(),
    semanticLocations: [],
  };
}

function addSemanticLocation(index: SymbolIndex, name: string, range: Range): void {
  index.semanticLocations.push({ name, range });
}

function addDefinition(
  index: SymbolIndex,
  uri: string,
  name: string,
  range: Range | undefined,
): void {
  if (!range) {
    return;
  }
  index.definitions.set(name, Location.create(uri, range));
  addSemanticLocation(index, name, range);
}

function addReference(
  index: SymbolIndex,
  uri: string,
  name: string,
  range: Range | undefined,
): void {
  if (!range || !index.definitions.has(name)) {
    return;
  }
  const references = index.references.get(name) ?? [];
  references.push(Location.create(uri, range));
  index.references.set(name, references);
  addSemanticLocation(index, name, range);
}

function addDefinitionAtSpan(
  index: SymbolIndex,
  document: TextDocument,
  name: string,
  span: SourceSpan,
): void {
  const line = span.line - 1;
  addDefinition(
    index,
    document.uri,
    name,
    identifierRangeOnLine(lineTextAt(document, line), line, name),
  );
}

function addReferencesFromLine(
  index: SymbolIndex,
  document: TextDocument,
  line: number,
  identifiers: string[],
): void {
  const text = lineTextAt(document, line);
  let cursor = 0;
  for (const identifier of identifiers) {
    const range = identifierRangeOnLine(text, line, identifier, cursor);
    addReference(index, document.uri, identifier, range);
    if (range) {
      cursor = range.end.character;
    }
  }
}

function buildSymbolIndex(document: TextDocument, ast: DocumentAst): SymbolIndex {
  const index = createSymbolIndex();

  if (ast.framework) {
    addDefinitionAtSpan(index, document, ast.framework.name, ast.framework.span);
  }
  for (const domain of ast.domains) {
    addDefinitionAtSpan(index, document, domain.name, domain.span);
  }
  for (const problem of ast.problems) {
    addDefinitionAtSpan(index, document, problem.name, problem.span);
  }
  for (const step of ast.steps) {
    addDefinitionAtSpan(index, document, step.id, step.span);
    addDefinitionAtSpan(index, document, step.statement.id, step.statement.span);
  }
  for (const query of ast.queries) {
    addDefinitionAtSpan(index, document, query.id, query.span);
  }

  if (ast.framework) {
    for (const rule of ast.framework.rules) {
      addReferencesFromLine(
        index,
        document,
        rule.span.line - 1,
        tokenizeRuleValue(rule.value),
      );
    }
  }

  for (const step of ast.steps) {
    if (step.statement.role === "decision") {
      addReferencesFromLine(
        index,
        document,
        step.statement.span.line - 1,
        step.statement.basedOn,
      );
      continue;
    }

    if (step.statement.role === "partition") {
      addReferencesFromLine(
        index,
        document,
        step.statement.span.line - 1,
        [step.statement.domainName, step.statement.axis],
      );
      continue;
    }

    if (step.statement.role === "viewpoint") {
      addReferencesFromLine(
        index,
        document,
        step.statement.span.line,
        [step.statement.axis],
      );
    }
  }

  for (const query of ast.queries) {
    addReferencesFromLine(
      index,
      document,
      query.expressionSpan.line - 1,
      extractQueryArguments(query.expression),
    );
  }

  return index;
}

function positionInRange(position: Position, range: Range): boolean {
  if (position.line < range.start.line || position.line > range.end.line) {
    return false;
  }
  if (
    position.line === range.start.line &&
    position.character < range.start.character
  ) {
    return false;
  }
  if (
    position.line === range.end.line &&
    position.character > range.end.character
  ) {
    return false;
  }
  return true;
}

function symbolAtPosition(index: SymbolIndex, position: Position): string | undefined {
  return index.semanticLocations.find(({ range }) => positionInRange(position, range))
    ?.name;
}

function parseIndexedDocument(
  document: TextDocument,
): { ast: DocumentAst; index: SymbolIndex } | undefined {
  try {
    const ast = parseDocument(document.getText());
    return { ast, index: buildSymbolIndex(document, ast) };
  } catch {
    return undefined;
  }
}

function severityToDiagnostic(
  severity: "fatal" | "error" | "warning" | "info" | "hint",
): DiagnosticSeverity {
  switch (severity) {
    case "fatal":
    case "error":
      return DiagnosticSeverity.Error;
    case "warning":
      return DiagnosticSeverity.Warning;
    case "info":
      return DiagnosticSeverity.Information;
    case "hint":
      return DiagnosticSeverity.Hint;
  }
}

function buildReferenceRanges(document: DocumentAst): Map<string, Range> {
  const ranges = new Map<string, Range>();
  const add = (key: string, span: SourceSpan, label: string) => {
    ranges.set(key, toRange(span, span.column - 1 + label.length));
  };

  if (document.framework) {
    add(document.framework.name, document.framework.span, document.framework.name);
  }
  for (const domain of document.domains) {
    add(domain.name, domain.span, domain.name);
  }
  for (const problem of document.problems) {
    add(problem.name, problem.span, problem.name);
  }
  for (const step of document.steps) {
    add(step.id, step.span, step.id);
    add(step.statement.id, step.statement.span, step.statement.id);
  }
  for (const query of document.queries) {
    add(query.id, query.span, query.id);
  }

  return ranges;
}

function metadataRange(
  textDocument: TextDocument,
  issue: AuditIssue,
): Range | undefined {
  const line = Number(issue.metadata?.line);
  const column = Number(issue.metadata?.column);
  const endColumn = Number(issue.metadata?.end_column);
  if (
    Number.isFinite(line) &&
    line > 0 &&
    Number.isFinite(column) &&
    column > 0
  ) {
    const lineText = lineTextAt(textDocument, line - 1);
    const resolvedEndColumn =
      Number.isFinite(endColumn) && endColumn > column
        ? endColumn
        : column + 1;
    return Range.create(
      Position.create(line - 1, Math.min(column - 1, lineText.length)),
      Position.create(line - 1, Math.min(resolvedEndColumn - 1, lineText.length)),
    );
  }

  const unresolvedRef = issue.metadata?.unresolved_ref;
  if (
    Number.isFinite(line) &&
    line > 0 &&
    typeof unresolvedRef === "string" &&
    unresolvedRef.length > 0
  ) {
    return identifierRangeOnLine(
      lineTextAt(textDocument, line - 1),
      line - 1,
      unresolvedRef,
    );
  }

  return undefined;
}

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  const diagnostics = [];

  try {
    const ast = parseDocument(textDocument.getText());
    const report = await auditDslText(textDocument.getText(), textDocument.uri, {
      embeddings: { provider: "none" },
    });
    const referenceRanges = buildReferenceRanges(ast);
    for (const issue of report.results) {
      const issueRange = metadataRange(textDocument, issue);
      diagnostics.push({
        range:
          issueRange ??
          referenceRanges.get(issue.target_refs[0]?.ref_id ?? "") ??
          Range.create(Position.create(0, 0), Position.create(0, 1)),
        severity: severityToDiagnostic(issue.severity),
        source: "llmthink",
        code: issue.category,
        message: [issue.message, issue.rationale, issue.suggestion]
          .filter(Boolean)
          .join("\n"),
      });
    }
  } catch (error) {
    if (error instanceof ParseError) {
      diagnostics.push({
        range: Range.create(
          Position.create(error.line - 1, Math.max(error.column - 1, 0)),
          Position.create(error.line - 1, Math.max(error.endColumn - 1, error.column)),
        ),
        severity: DiagnosticSeverity.Error,
        source: "llmthink",
        message: error.message,
      });
    } else {
      connection.console.error(String(error));
    }
  }

  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

function symbolRange(span: SourceSpan, name: string): Range {
  return Range.create(
    Position.create(span.line - 1, 0),
    Position.create(span.line - 1, name.length + 20),
  );
}

function makeSymbol(
  name: string,
  kind: SymbolKind,
  span: SourceSpan,
  detail?: string,
): DocumentSymbol {
  const range = symbolRange(span, name);
  return { name, detail, kind, range, selectionRange: range };
}

function stepBodySymbol(step: StepDecl): DocumentSymbol {
  const kind = (() => {
    switch (step.statement.role) {
      case "decision":
        return SymbolKind.EnumMember;
      case "comparison":
        return SymbolKind.Operator;
      case "evidence":
      case "premise":
        return SymbolKind.String;
      case "partition":
        return SymbolKind.Array;
      case "pending":
        return SymbolKind.Event;
      case "viewpoint":
        return SymbolKind.Interface;
    }
  })();
  return makeSymbol(step.statement.id, kind, step.statement.span, step.statement.role);
}

function buildDocumentSymbols(document: DocumentAst): DocumentSymbol[] {
  const symbols: DocumentSymbol[] = [];

  if (document.framework) {
    const framework = makeSymbol(
      document.framework.name,
      SymbolKind.Module,
      document.framework.span,
      "framework",
    );
    framework.children = document.framework.rules.map((rule) =>
      makeSymbol(`${rule.kind} ${rule.value}`, SymbolKind.Property, rule.span),
    );
    symbols.push(framework);
  }

  symbols.push(
    ...document.domains.map((domain) =>
      makeSymbol(domain.name, SymbolKind.Namespace, domain.span, "domain"),
    ),
  );
  symbols.push(
    ...document.problems.map((problem) =>
      makeSymbol(problem.name, SymbolKind.Object, problem.span, "problem"),
    ),
  );
  symbols.push(
    ...document.steps.map((step) => ({
      ...makeSymbol(step.id, SymbolKind.Method, step.span, step.statement.role),
      children: [stepBodySymbol(step)],
    })),
  );
  symbols.push(
    ...document.queries.map((query) =>
      makeSymbol(query.id, SymbolKind.Function, query.span, "query"),
    ),
  );

  return symbols;
}

function getWordAtPosition(
  document: TextDocument,
  position: Position,
): string | undefined {
  const lineText = lineTextAt(document, position.line);
  const matches = [...lineText.matchAll(/[A-Za-z][A-Za-z0-9_-]*/g)];
  return matches.find((match) => {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    return position.character >= start && position.character <= end;
  })?.[0];
}

function queryAtPosition(
  document: TextDocument,
  position: Position,
): DocumentAst["queries"][number] | undefined {
  try {
    const ast = parseDocument(document.getText());
    return ast.queries.find(
      (query) =>
        query.expressionSpan.line - 1 === position.line &&
        position.character >= query.expressionSpan.column - 1,
    );
  } catch {
    return undefined;
  }
}

function isDslqlQueryPosition(
  document: TextDocument,
  position: Position,
): boolean {
  return Boolean(queryAtPosition(document, position));
}

function buildHover(document: TextDocument, position: Position): Hover | null {
  const word = getWordAtPosition(document, position);
  if (!word) {
    return null;
  }
  const description =
    KEYWORD_DOCS[word] ?? QUERY_FUNCTION_DOCS[word] ?? DSLQL_IDENTIFIER_DOCS[word];
  if (!description) {
    return null;
  }
  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: `**${word}**\n\n${description}`,
    },
  };
}

function buildDslqlCompletionItems() {
  return DSLQL_COMPLETIONS.map((item) => ({
    label: item.label,
    kind: item.kind ?? CompletionItemKind.Function,
    detail: item.detail,
    documentation: item.documentation,
    insertText: item.insertText ?? item.label,
    insertTextFormat: InsertTextFormat.Snippet,
  }));
}

function buildRenameEdit(document: TextDocument, name: string, newName: string): WorkspaceEdit {
  const parsed = parseIndexedDocument(document);
  const edits: TextEdit[] = [];
  if (!parsed) {
    return { changes: { [document.uri]: edits } };
  }

  const definition = parsed.index.definitions.get(name);
  if (definition) {
    edits.push(TextEdit.replace(definition.range, newName));
  }
  for (const reference of parsed.index.references.get(name) ?? []) {
    edits.push(TextEdit.replace(reference.range, newName));
  }

  return {
    changes: {
      [document.uri]: edits,
    },
  };
}

function nextStepId(ast: DocumentAst): string {
  const maxStep = ast.steps.reduce((currentMax, step) => {
    const match = /^S(\d+)$/.exec(step.id);
    if (!match) {
      return currentMax;
    }
    return Math.max(currentMax, Number(match[1]));
  }, 0);
  return `S${maxStep + 1}`;
}

function inferStatementBlock(identifier: string): string {
  if (identifier.startsWith("PR")) {
    return `premise ${identifier}:\n    \"TODO: add premise\"`;
  }
  if (identifier.startsWith("EV")) {
    return `evidence ${identifier}:\n    \"TODO: add evidence\"`;
  }
  if (identifier.startsWith("PD")) {
    return `pending ${identifier}:\n    \"TODO: add pending item\"`;
  }
  if (identifier.startsWith("D")) {
    return `decision ${identifier} based_on TODO:\n    \"TODO: add decision\"`;
  }
  return `evidence ${identifier}:\n    \"TODO: define ${identifier}\"`;
}

function formatDocumentAction(document: TextDocument): CodeAction | undefined {
  const formatted = formatDslText(document.getText());
  if (formatted === document.getText()) {
    return undefined;
  }
  return {
    title: "Format document",
    kind: CodeActionKind.Source,
    edit: {
      changes: {
        [document.uri]: [TextEdit.replace(fullDocumentRange(document), formatted)],
      },
    },
  };
}

function missingBasedOnAction(
  document: TextDocument,
  ast: DocumentAst,
  issue: AuditIssue,
): CodeAction | undefined {
  if (!issue.message.includes("根拠参照がない")) {
    return undefined;
  }

  const candidateIds = ast.steps
    .filter(
      (step) =>
        step.statement.role === "premise" || step.statement.role === "evidence",
    )
    .map((step) => step.statement.id)
    .slice(0, 2);
  if (candidateIds.length === 0) {
    return undefined;
  }

  const line = issue.target_refs[0]?.step_id
    ? ast.steps.find((step) => step.id === issue.target_refs[0]?.step_id)?.statement.span.line
    : undefined;
  if (!line) {
    return undefined;
  }
  const lineIndex = line - 1;
  const originalLine = lineTextAt(document, lineIndex);
  const updatedLine = originalLine.replace(
    /:\s*$/,
    ` based_on ${candidateIds.join(", ")}:`,
  );
  if (updatedLine === originalLine) {
    return undefined;
  }

  return {
    title: `Add based_on ${candidateIds.join(", ")}`,
    kind: CodeActionKind.QuickFix,
    diagnostics: [
      {
        range: Range.create(Position.create(lineIndex, 0), Position.create(lineIndex, originalLine.length)),
        message: issue.message,
      },
    ],
    edit: {
      changes: {
        [document.uri]: [
          TextEdit.replace(
            Range.create(
              Position.create(lineIndex, 0),
              Position.create(lineIndex, originalLine.length),
            ),
            updatedLine,
          ),
        ],
      },
    },
  };
}

function missingReferenceAction(
  document: TextDocument,
  ast: DocumentAst,
  issue: AuditIssue,
): CodeAction | undefined {
  const match = issue.message.match(/参照\s+([A-Za-z][A-Za-z0-9_-]*)\s+を解決できない/);
  if (!match) {
    return undefined;
  }

  const identifier = match[1];
  const stepBlock = `\n\nstep ${nextStepId(ast)}:\n  ${inferStatementBlock(identifier)}\n`;
  const endLine = Math.max(document.lineCount - 1, 0);
  const endCharacter = lineTextAt(document, endLine).length;

  return {
    title: `Create missing definition for ${identifier}`,
    kind: CodeActionKind.QuickFix,
    edit: {
      changes: {
        [document.uri]: [
          TextEdit.insert(Position.create(endLine, endCharacter), stepBlock),
        ],
      },
    },
  };
}

function buildCodeActions(
  document: TextDocument,
  ast: DocumentAst,
  issues: AuditIssue[],
): CodeAction[] {
  const actions: CodeAction[] = [];
  const formatAction = formatDocumentAction(document);
  if (formatAction) {
    actions.push(formatAction);
  }

  for (const issue of issues) {
    const basedOnAction = missingBasedOnAction(document, ast, issue);
    if (basedOnAction) {
      actions.push(basedOnAction);
    }
    const referenceAction = missingReferenceAction(document, ast, issue);
    if (referenceAction) {
      actions.push(referenceAction);
    }
  }

  return actions;
}

connection.onInitialize((params: InitializeParams): InitializeResult => {
  hasConfigurationCapability = Boolean(params.capabilities.workspace?.configuration);

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      documentFormattingProvider: true,
      documentSymbolProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      renameProvider: { prepareProvider: true },
      documentHighlightProvider: true,
      codeActionProvider: true,
      hoverProvider: true,
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: [".", "|", "(", "["],
      },
    },
  };
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    connection.client.register(DidChangeConfigurationNotification.type);
  }
});

documents.onDidOpen((event) => {
  void validateTextDocument(event.document);
});

documents.onDidChangeContent((change) => {
  void validateTextDocument(change.document);
});

documents.onDidClose((event) => {
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

connection.onDocumentFormatting((params): TextEdit[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }
  return [TextEdit.replace(fullDocumentRange(document), formatDslText(document.getText()))];
});

connection.onDocumentSymbol((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }
  const parsed = parseIndexedDocument(document);
  return parsed ? buildDocumentSymbols(parsed.ast) : [];
});

connection.onDefinition((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }
  const parsed = parseIndexedDocument(document);
  if (!parsed) {
    return null;
  }
  const name = symbolAtPosition(parsed.index, params.position);
  return name ? parsed.index.definitions.get(name) ?? null : null;
});

connection.onReferences((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }
  const parsed = parseIndexedDocument(document);
  if (!parsed) {
    return [];
  }
  const name = symbolAtPosition(parsed.index, params.position);
  if (!name) {
    return [];
  }
  const references = parsed.index.references.get(name) ?? [];
  const definition = parsed.index.definitions.get(name);
  return params.context.includeDeclaration && definition
    ? [definition, ...references]
    : references;
});

connection.onPrepareRename((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }
  const parsed = parseIndexedDocument(document);
  if (!parsed) {
    return null;
  }
  const name = symbolAtPosition(parsed.index, params.position);
  if (!name) {
    return null;
  }
  const definition = parsed.index.definitions.get(name);
  return definition ? definition.range : null;
});

connection.onRenameRequest((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }
  const parsed = parseIndexedDocument(document);
  if (!parsed) {
    return null;
  }
  const name = symbolAtPosition(parsed.index, params.position);
  if (!name) {
    return null;
  }
  return buildRenameEdit(document, name, params.newName);
});

connection.onDocumentHighlight((params): DocumentHighlight[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }
  const parsed = parseIndexedDocument(document);
  if (!parsed) {
    return [];
  }
  const name = symbolAtPosition(parsed.index, params.position);
  if (!name) {
    return [];
  }
  const definition = parsed.index.definitions.get(name);
  const references = parsed.index.references.get(name) ?? [];
  const highlights: DocumentHighlight[] = references.map((reference) => ({
    range: reference.range,
    kind: DocumentHighlightKind.Read,
  }));
  if (definition) {
    highlights.unshift({
      range: definition.range,
      kind: DocumentHighlightKind.Write,
    });
  }
  return highlights;
});

connection.onCodeAction(async (params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }
  try {
    const ast = parseDocument(document.getText());
    const report = await auditDslText(document.getText(), document.uri, {
      embeddings: { provider: "none" },
    });
    return buildCodeActions(document, ast, report.results);
  } catch {
    return [];
  }
});

connection.onHover((params) => {
  const document = documents.get(params.textDocument.uri);
  return document ? buildHover(document, params.position) : null;
});

connection.onCompletion((params) => {
  const document = documents.get(params.textDocument.uri);
  const keywordItems = Object.entries(KEYWORD_DOCS).map(([label, documentation]) => ({
    label,
    kind: CompletionItemKind.Keyword,
    documentation,
  }));
  const queryItems = Object.entries(QUERY_FUNCTION_DOCS).map(([label, documentation]) => ({
    label,
    kind: CompletionItemKind.Function,
    documentation,
  }));
  if (document && isDslqlQueryPosition(document, params.position)) {
    return [...buildDslqlCompletionItems(), ...queryItems];
  }
  return [...keywordItems, ...queryItems];
});

documents.listen(connection);
connection.listen();