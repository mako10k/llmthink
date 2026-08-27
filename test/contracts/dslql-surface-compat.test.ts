import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { DSLQL_FUNCTION_SPECS, getDslSyntaxGuidanceText } from "@llmthink/core";

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
