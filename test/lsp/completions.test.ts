import assert from "node:assert/strict";
import test from "node:test";
import {
  CompletionItemKind,
  InsertTextFormat,
  Position,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  buildContextualDslCompletions,
  buildDslqlCompletionItems,
  isDslqlQueryPosition,
} from "../../src/lsp/completions.js";

const DOCUMENTATION: Readonly<Record<string, string>> = new Proxy(
  {},
  { get: (_target, property) => `docs:${String(property)}` },
);

function document(text: string): TextDocument {
  return TextDocument.create("file:///completion.think", "llmthink", 1, text);
}

function endOfLine(text: string, line: number): Position {
  return Position.create(line, (text.split("\n")[line] ?? "").length);
}

function labels(text: string, line: number): string[] {
  return (
    buildContextualDslCompletions(
      document(text),
      endOfLine(text, line),
      DOCUMENTATION,
    ) ?? []
  ).map((item) => item.label);
}

test("statement role completion is scoped to a step body", () => {
  const text = ["step S1:", "  dec"].join("\n");
  const items =
    buildContextualDslCompletions(
      document(text),
      endOfLine(text, 1),
      DOCUMENTATION,
    ) ?? [];

  assert.deepEqual(
    items.map((item) => item.label),
    [
      "premise",
      "viewpoint",
      "partition",
      "evidence",
      "decision",
      "comparison",
      "pending",
    ],
  );
  const decision = items.find((item) => item.label === "decision");
  assert.equal(decision?.kind, CompletionItemKind.Snippet);
  assert.equal(decision?.insertTextFormat, InsertTextFormat.Snippet);
  assert.equal(decision?.insertText, "decision ${1:D1} based_on ${2:REF}:");

  assert.equal(labels("dec", 0).length, 0);
});

test("annotation and comparison completions return closed vocabularies", () => {
  const annotationText = ["problem P1:", '  "text"', "  annotation"].join("\n");
  assert.deepEqual(labels(annotationText, 2), [
    "explanation",
    "rationale",
    "status",
    "caveat",
    "todo",
    "orphan_future",
    "orphan_reference",
  ]);

  const comparisonText = "comparison C1 on P1 viewpoint V1 relation preferred";
  assert.deepEqual(labels(comparisonText, 0), [
    "preferred_over",
    "weaker_than",
    "incomparable",
    "counterexample_to",
  ]);
});

test("evidence completion separates resource blocks from resource fields", () => {
  const resourceText = ["evidence EV1:", '  "text"', "  "].join("\n");
  const resourceItems =
    buildContextualDslCompletions(
      document(resourceText),
      endOfLine(resourceText, 2),
      DOCUMENTATION,
    ) ?? [];
  assert.equal(resourceItems[0]?.label, "resource");
  assert.match(resourceItems[0]?.insertText ?? "", /\$\{1\|url,file,blob\|\}/);

  const fieldText = ["evidence EV1:", '  "text"', "  resource:", "    "].join(
    "\n",
  );
  assert.deepEqual(labels(fieldText, 3), [
    "url",
    "file",
    "blob",
    "digest",
    "mime",
    "label",
  ]);
});

test("confidence keyword completion distinguishes source and edge profiles", () => {
  const sourceText = ["confidence EV1:", "  keyword"].join("\n");
  const sourceLabels = labels(sourceText, 1);
  assert.ok(sourceLabels.includes("strong_assumption"));
  assert.ok(!sourceLabels.includes("strong_inference"));

  const edgeText = ["confidence EV1 -> D1:", "  keyword"].join("\n");
  const edgeLabels = labels(edgeText, 1);
  assert.ok(edgeLabels.includes("strong_inference"));
  assert.ok(!edgeLabels.includes("strong_assumption"));
});

test("DSLQL completion is restricted to a query expression", () => {
  const text = ["query Q1:", "  .document.problems[]"].join("\n");
  const queryDocument = document(text);
  assert.equal(isDslqlQueryPosition(queryDocument, endOfLine(text, 1)), true);
  assert.equal(
    isDslqlQueryPosition(queryDocument, Position.create(0, 0)),
    false,
  );

  assert.deepEqual(
    buildDslqlCompletionItems([
      {
        label: "select(...)",
        detail: "DSLQL filter",
        documentation: "filter docs",
        insertText: "select(${1:.role})",
      },
    ]),
    [
      {
        label: "select(...)",
        kind: CompletionItemKind.Function,
        detail: "DSLQL filter",
        documentation: "filter docs",
        insertText: "select(${1:.role})",
        insertTextFormat: InsertTextFormat.Snippet,
      },
    ],
  );
});
