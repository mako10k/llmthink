import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DSLQL_FUNCTION_SPECS,
  createDocumentDslqlRuntime,
  evaluateDslqlExpression,
  parseDocument,
  getDslSyntaxGuidanceText,
} from "@mako10k/llmthink-core";

test("root help resolves the distributed example catalog", () => {
  const help = getDslSyntaxGuidanceText({
    topic: "usecases",
    subtopic: "ideation",
    detail: "detail",
  });
  assert.match(help, /docs\/examples\/ideation-profile\.think/);
});

test("Help and VSIX function surfaces contain only Core registry functions", () => {
  const registryNames = new Set(
    DSLQL_FUNCTION_SPECS.map((entry) => entry.name),
  );
  const help = getDslSyntaxGuidanceText({
    topic: "query",
    subtopic: "functions",
    detail: "detail",
  });
  for (const functionSpec of DSLQL_FUNCTION_SPECS) {
    assert.match(help, new RegExp(`\\b${functionSpec.name}\\(`));
  }

  const grammar = readFileSync(
    "vscode-extension/syntaxes/llmthink.tmLanguage.json",
    "utf8",
  );
  const grammarLines = grammar.split("\n");
  const functionScopeLine = grammarLines.findIndex((line) =>
    line.includes("support.function.dslql.llmthink"),
  );
  const serializedPattern = grammarLines[functionScopeLine + 1]
    ?.trim()
    .replace(/^"match": /, "")
    .replace(/,$/, "");
  const functionPattern = serializedPattern
    ? (JSON.parse(serializedPattern) as string)
    : "";
  const groupStart = functionPattern.indexOf("(");
  const groupEnd = functionPattern.indexOf(")", groupStart + 1);
  const grammarFunctionList =
    groupStart >= 0 && groupEnd > groupStart
      ? functionPattern.slice(groupStart + 1, groupEnd).split("|")
      : [];
  assert.deepEqual(grammarFunctionList.sort(), [...registryNames].sort());

  const snippets = readFileSync(
    "vscode-extension/snippets/dslql.code-snippets",
    "utf8",
  );
  const snippetFunctions = [
    ...new Set(
      [...snippets.matchAll(/\b([a-z][a-z_]*)\(/g)].map((match) => match[1]!),
    ),
  ];
  assert.ok(snippetFunctions.length > 0);
  for (const name of snippetFunctions) {
    assert.equal(registryNames.has(name), true);
  }
});

test("quick help exposes action targets and the unknown-cause sample", () => {
  for (const [topic, subtopic] of [
    ["syntax", "decision"],
    ["usecases", "problem-solving"],
  ]) {
    const help = getDslSyntaxGuidanceText({ topic, subtopic, detail: "quick" });
    assert.match(help, /acts_on/);
    assert.match(help, /relation/);
    assert.match(help, /samples causal-impact-unknown detail/);
  }
  const help = getDslSyntaxGuidanceText({
    topic: "query",
    subtopic: "roots",
    detail: "detail",
  });
  for (const field of [
    ".acts_on",
    ".relations",
    "family",
    "target_id",
    "mechanism",
  ]) {
    assert.ok(help.includes(field), field);
  }
});

test("relation query help examples work with legacy and extended decisions", () => {
  const text =
    readFileSync("docs/examples/causal-impact-unknown.think", "utf8") +
    '\ndecision Legacy based_on E1:\n  "legacy decision"\n';
  const runtime = createDocumentDslqlRuntime(parseDocument(text));
  const projections = evaluateDslqlExpression(
    '.document.steps[].statement | select(.role == "decision") | {id: .id, based_on: .based_on, acts_on: .acts_on?}',
    runtime,
  );
  assert.ok(
    projections.some(
      (value) =>
        typeof value === "object" &&
        value !== null &&
        "id" in value &&
        value.id === "Legacy",
    ),
  );
  const relations = evaluateDslqlExpression(
    '.document.steps[].statement | select(.role == "decision") | .relations?[] | select(.family == "acts_on")',
    runtime,
  );
  assert.equal(relations.length, 1);
});
