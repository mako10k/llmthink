import {
  CodeActionKind,
  Position,
  Range,
  TextEdit,
  type CodeAction,
  type Diagnostic,
} from "vscode-languageserver/node.js";
import type { TextDocument } from "vscode-languageserver-textdocument";

import { formatDslText } from "../dsl/format.js";
import type { DocumentAst } from "../model/ast.js";
import type { AuditIssue } from "../model/diagnostics.js";

function lineTextAt(document: TextDocument, line: number): string {
  return document.getText({
    start: Position.create(line, 0),
    end: Position.create(line + 1, 0),
  });
}

function fullDocumentRange(document: TextDocument): Range {
  const lastLine = Math.max(document.lineCount - 1, 0);
  const lastLineText = lineTextAt(document, lastLine);
  return {
    start: Position.create(0, 0),
    end: Position.create(lastLine, lastLineText.length),
  };
}

function issueDiagnostic(
  document: TextDocument,
  issue: AuditIssue,
): Diagnostic | undefined {
  const line = Number(issue.metadata?.line);
  const column = Number(issue.metadata?.column);
  const endColumn = Number(issue.metadata?.end_column);
  if (
    !Number.isFinite(line) ||
    line <= 0 ||
    !Number.isFinite(column) ||
    column <= 0
  ) {
    return undefined;
  }

  const lineIndex = line - 1;
  const lineLength = lineTextAt(document, lineIndex).length;
  const resolvedEndColumn =
    Number.isFinite(endColumn) && endColumn > column ? endColumn : column + 1;
  return {
    range: Range.create(
      Position.create(lineIndex, Math.min(column - 1, lineLength)),
      Position.create(lineIndex, Math.min(resolvedEndColumn - 1, lineLength)),
    ),
    message: issue.message,
    source: "llmthink",
    code: issue.category,
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
    return `premise ${identifier}:\n    "TODO: add premise"`;
  }
  if (identifier.startsWith("EV")) {
    return `evidence ${identifier}:\n    "TODO: add evidence"`;
  }
  if (identifier.startsWith("PD")) {
    return `pending ${identifier}:\n    "TODO: add pending item"`;
  }
  if (identifier.startsWith("D")) {
    return `decision ${identifier} based_on TODO:\n    "TODO: add decision"`;
  }
  return `evidence ${identifier}:\n    "TODO: define ${identifier}"`;
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
        [document.uri]: [
          TextEdit.replace(fullDocumentRange(document), formatted),
        ],
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
    ? ast.steps.find((step) => step.id === issue.target_refs[0]?.step_id)
        ?.statement.span.line
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
    diagnostics: [issueDiagnostic(document, issue)].filter(
      (diagnostic): diagnostic is Diagnostic => diagnostic !== undefined,
    ),
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
  const match = issue.message.match(
    /参照\s+([A-Za-z][A-Za-z0-9_-]*)\s+を解決できない/,
  );
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
    diagnostics: [issueDiagnostic(document, issue)].filter(
      (diagnostic): diagnostic is Diagnostic => diagnostic !== undefined,
    ),
    edit: {
      changes: {
        [document.uri]: [
          TextEdit.insert(Position.create(endLine, endCharacter), stepBlock),
        ],
      },
    },
  };
}

export function buildCodeActions(
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
