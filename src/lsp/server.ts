#!/usr/bin/env node

import {
  CompletionItemKind,
  DiagnosticSeverity,
  DidChangeConfigurationNotification,
  DocumentFormattingRequest,
  Hover,
  InitializeParams,
  InitializeResult,
  MarkupKind,
  ProposedFeatures,
  SymbolKind,
  TextDocumentSyncKind,
  createConnection,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  DocumentSymbol,
  Position,
  Range,
  TextEdit,
} from "vscode-languageserver-types";
import { auditDslText } from "../analyzer/audit.js";
import { formatDslText } from "../dsl/format.js";
import { ParseError, parseDocument } from "../parser/parser.js";
import type {
  DocumentAst,
  FrameworkDecl,
  ProblemDecl,
  QueryDecl,
  SourceSpan,
  StepDecl,
} from "../model/ast.js";
import { TextDocuments } from "vscode-languageserver";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;

const KEYWORD_DOCS: Record<string, string> = {
  framework: "文書全体の制約や期待役割を宣言します。",
  domain: "評価対象の分類軸や対象領域を定義します。",
  problem: "検討対象の問題文を定義します。",
  step: "1 つの推論ステップを表します。",
  premise: "前提を表す step body です。",
  viewpoint: "評価軸を表す step body です。",
  axis: "viewpoint や partition の軸名を示します。",
  partition: "MECE 分割候補を表す step body です。",
  evidence: "根拠を表す step body です。",
  decision: "判断を表す step body です。",
  based_on: "decision の参照根拠を列挙します。",
  pending: "未解決事項を表す step body です。",
  query: "DSL 文書に対する問い合わせを宣言します。",
  requires: "framework が要求する役割を表します。",
  forbids: "framework が禁止する要素を表します。",
  warns: "framework が注意喚起する要素を表します。",
};

function toRange(span: SourceSpan, endColumn?: number): Range {
  return {
    start: { line: span.line - 1, character: span.column - 1 },
    end: { line: span.line - 1, character: endColumn ?? span.column },
  };
}

function fullDocumentRange(document: TextDocument): Range {
  const lastLine = document.lineCount - 1;
  return {
    start: Position.create(0, 0),
    end: Position.create(lastLine, document.getText().length),
  };
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

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  const source = textDocument.getText();
  const diagnostics = [];

  try {
    const ast = parseDocument(source);
    const report = await auditDslText(source, textDocument.uri, {
      embeddings: { provider: "none" },
    });
    const referenceRanges = buildReferenceRanges(ast);
    for (const issue of report.results) {
      const line = Number(issue.metadata?.line);
      const parseRange =
        Number.isFinite(line) && line > 0
          ? {
              start: Position.create(line - 1, 0),
              end: Position.create(line - 1, Number.MAX_SAFE_INTEGER),
            }
          : undefined;
      diagnostics.push({
        range:
          parseRange ??
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
        range: {
          start: Position.create(error.line - 1, 0),
          end: Position.create(error.line - 1, Number.MAX_SAFE_INTEGER),
        },
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
  return {
    start: Position.create(span.line - 1, 0),
    end: Position.create(span.line - 1, name.length + 20),
  };
}

function makeSymbol(name: string, kind: SymbolKind, span: SourceSpan): DocumentSymbol {
  const range = symbolRange(span, name);
  return {
    name,
    kind,
    range,
    selectionRange: range,
  };
}

function stepBodySymbol(step: StepDecl): DocumentSymbol {
  const kind = (() => {
    switch (step.statement.role) {
      case "decision":
        return SymbolKind.EnumMember;
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
  return makeSymbol(step.statement.id, kind, step.statement.span);
}

function buildDocumentSymbols(document: DocumentAst): DocumentSymbol[] {
  const symbols: DocumentSymbol[] = [];

  if (document.framework) {
    const framework = makeSymbol(
      document.framework.name,
      SymbolKind.Module,
      document.framework.span,
    );
    framework.children = document.framework.rules.map((rule) =>
      makeSymbol(`${rule.kind} ${rule.value}`, SymbolKind.Property, document.framework!.span),
    );
    symbols.push(framework);
  }

  symbols.push(
    ...document.domains.map((domain) =>
      makeSymbol(domain.name, SymbolKind.Namespace, domain.span),
    ),
  );
  symbols.push(
    ...document.problems.map((problem) =>
      makeSymbol(problem.name, SymbolKind.Object, problem.span),
    ),
  );
  symbols.push(
    ...document.steps.map((step) => ({
      ...makeSymbol(step.id, SymbolKind.Method, step.span),
      children: [stepBodySymbol(step)],
    })),
  );
  symbols.push(
    ...document.queries.map((query) =>
      makeSymbol(query.id, SymbolKind.Function, query.span),
    ),
  );

  return symbols;
}

function getWordAtPosition(document: TextDocument, position: Position): string | undefined {
  const lineText = document.getText({
    start: Position.create(position.line, 0),
    end: Position.create(position.line, Number.MAX_SAFE_INTEGER),
  });
  const matches = [...lineText.matchAll(/[A-Za-z][A-Za-z0-9_-]*/g)];
  return matches.find((match) => {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    return position.character >= start && position.character <= end;
  })?.[0];
}

function buildHover(document: TextDocument, position: Position): Hover | null {
  const word = getWordAtPosition(document, position);
  if (!word) {
    return null;
  }
  const description = KEYWORD_DOCS[word];
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

connection.onInitialize((params: InitializeParams): InitializeResult => {
  hasConfigurationCapability = Boolean(
    params.capabilities.workspace?.configuration,
  );

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      documentFormattingProvider: true,
      documentSymbolProvider: true,
      hoverProvider: true,
      completionProvider: {
        resolveProvider: false,
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

  return [
    TextEdit.replace(fullDocumentRange(document), formatDslText(document.getText())),
  ];
});

connection.onDocumentSymbol((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }
  try {
    return buildDocumentSymbols(parseDocument(document.getText()));
  } catch {
    return [];
  }
});

connection.onHover((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }
  return buildHover(document, params.position);
});

connection.onCompletion(() => {
  return Object.entries(KEYWORD_DOCS).map(([label, documentation]) => ({
    label,
    kind: CompletionItemKind.Keyword,
    documentation,
  }));
});

documents.listen(connection);
connection.listen();