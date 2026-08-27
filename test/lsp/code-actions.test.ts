import assert from "node:assert/strict";
import test from "node:test";

import { CodeActionKind, type CodeAction } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";

import { auditDslText, formatDslText, parseDocument } from "@llmthink/core";
import { buildCodeActions } from "../../src/lsp/code-actions.ts";

const DOCUMENT_URI = "file:///workspace/code-actions.think";

async function actionsFor(source: string): Promise<{
  document: TextDocument;
  actions: CodeAction[];
}> {
  const document = TextDocument.create(DOCUMENT_URI, "llmthink", 1, source);
  const ast = parseDocument(source);
  const report = await auditDslText(source, DOCUMENT_URI, {
    embeddings: { provider: "none" },
  });
  return {
    document,
    actions: buildCodeActions(document, ast, report.results),
  };
}

function applyAction(document: TextDocument, action: CodeAction): string {
  const edits = action.edit?.changes?.[document.uri];
  assert.ok(edits);
  return TextDocument.applyEdits(document, edits);
}

test("format action replaces only the complete document with canonical text", async () => {
  const source = `problem P1:
 "format me"

step:
 decision D1 based_on P1:
  "keep the meaning"`;
  const { document, actions } = await actionsFor(source);
  const action = actions.find(
    (candidate) => candidate.title === "Format document",
  );

  assert.ok(action);
  assert.equal(action.kind, CodeActionKind.Source);
  assert.deepEqual(action.edit?.changes?.[document.uri]?.[0].range, {
    start: { line: 0, character: 0 },
    end: { line: 5, character: 20 },
  });
  assert.equal(applyAction(document, action), formatDslText(source));
});

test("missing based_on action repairs only the decision header", async () => {
  const source = `problem P1:
  "Choose safely"

step S1:
  premise PR1:
    "first basis"

step S2:
  evidence EV1:
    "second basis"

step S3:
  decision D1:
    "missing references"
`;
  const { document, actions } = await actionsFor(source);
  const action = actions.find(
    (candidate) => candidate.title === "Add based_on PR1, EV1",
  );

  assert.ok(action);
  assert.equal(action.kind, CodeActionKind.QuickFix);
  assert.deepEqual(action.diagnostics?.[0].range, {
    start: { line: 12, character: 11 },
    end: { line: 12, character: 13 },
  });
  assert.equal(action.diagnostics?.[0].code, "contract_violation");
  const edits = action.edit?.changes?.[document.uri];
  assert.equal(edits?.length, 1);
  assert.deepEqual(edits?.[0].range.start, { line: 12, character: 0 });
  assert.equal(edits?.[0].newText, "  decision D1 based_on PR1, EV1:");

  const repaired = applyAction(document, action);
  assert.match(repaired, /decision D1 based_on PR1, EV1:/);
  const repairedReport = await auditDslText(repaired, DOCUMENT_URI, {
    embeddings: { provider: "none" },
  });
  assert.equal(
    repairedReport.results.some((issue) =>
      issue.message.includes("decision D1 に根拠参照がない"),
    ),
    false,
  );
});

test("missing reference action appends one reviewable definition", async () => {
  const source = `problem P1:
  "Resolve references"

step S4:
  decision D1 based_on EV404:
    "needs evidence"`;
  const { document, actions } = await actionsFor(source);
  const action = actions.find(
    (candidate) => candidate.title === "Create missing definition for EV404",
  );

  assert.ok(action);
  assert.equal(action.kind, CodeActionKind.QuickFix);
  assert.deepEqual(action.diagnostics?.[0].range, {
    start: { line: 4, character: 23 },
    end: { line: 4, character: 28 },
  });
  assert.equal(action.diagnostics?.[0].code, "contract_violation");
  const edits = action.edit?.changes?.[document.uri];
  assert.equal(edits?.length, 1);
  assert.deepEqual(edits?.[0].range, {
    start: { line: 5, character: 20 },
    end: { line: 5, character: 20 },
  });
  assert.equal(
    edits?.[0].newText,
    '\n\nstep S5:\n  evidence EV404:\n    "TODO: add evidence"\n',
  );

  const repaired = applyAction(document, action);
  assert.doesNotThrow(() => parseDocument(repaired));
  const repairedReport = await auditDslText(repaired, DOCUMENT_URI, {
    embeddings: { provider: "none" },
  });
  assert.equal(
    repairedReport.results.some((issue) =>
      issue.message.includes("参照 EV404 を解決できない"),
    ),
    false,
  );
});
