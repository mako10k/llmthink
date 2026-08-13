import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getDslSyntaxGuidanceText } from "../../src/dsl/guidance.ts";
import {
  createDocumentDslqlRuntime,
  createSemanticDslqlRuntime,
  DSLQL_BUILTIN_FUNCTION_NAMES,
  DSLQL_FUNCTION_SPECS,
  listDslqlFunctionSpecs,
} from "../../src/dslql/query.ts";
import { parseDocument } from "../../src/parser/parser.ts";

function namesFor(category: "core" | "relation" | "context" | "semantic") {
  return listDslqlFunctionSpecs([category]).map((entry) => entry.name);
}

test("function registry is unique and matches evaluator/runtime implementations", async () => {
  const allNames = DSLQL_FUNCTION_SPECS.map((entry) => entry.name);
  assert.equal(new Set(allNames).size, allNames.length);
  assert.deepEqual(
    [...DSLQL_BUILTIN_FUNCTION_NAMES].sort(),
    namesFor("core").sort(),
  );

  const documentRuntime = createDocumentDslqlRuntime(parseDocument(""));
  assert.deepEqual(
    Object.keys(documentRuntime.functions ?? {}).sort(),
    [...namesFor("relation"), ...namesFor("context")].sort(),
  );

  const semanticRuntime = await createSemanticDslqlRuntime(
    documentRuntime,
    'similarity("a", "b")',
    {
      embedder: async (texts) => ({
        embeddings: texts.map((text) => (text === "a" ? [1, 0] : [0, 1])),
        provider: "deterministic",
        model: "registry-test",
      }),
    },
  );
  const semanticNames = new Set(namesFor("semantic"));
  assert.deepEqual(
    Object.keys(semanticRuntime.functions ?? {})
      .filter((name) => semanticNames.has(name))
      .sort(),
    [...semanticNames].sort(),
  );
});

test("Help and VSIX function surfaces contain only registry functions", () => {
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
  for (const name of snippetFunctions)
    assert.equal(registryNames.has(name), true);
});
