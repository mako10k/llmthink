import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

interface GrammarPattern {
  name?: string;
  patterns?: GrammarPattern[];
}

interface TextMateGrammar {
  repository: Record<string, GrammarPattern>;
}

const grammar = JSON.parse(
  readFileSync(
    new URL(
      "../../vscode-extension/syntaxes/llmthink.tmLanguage.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as TextMateGrammar;

function collectScopeNames(pattern: GrammarPattern): string[] {
  return [
    ...(pattern.name ? [pattern.name] : []),
    ...(pattern.patterns ?? []).flatMap(collectScopeNames),
  ];
}

test("TextMate grammar distinguishes structural and query syntax", () => {
  const scopes = new Set(
    Object.values(grammar.repository).flatMap(collectScopeNames),
  );

  for (const scope of [
    "keyword.control.llmthink",
    "entity.name.function.statement.llmthink",
    "storage.type.annotation.llmthink",
    "support.type.property-name.resource.llmthink",
    "constant.language.confidence-keyword.llmthink",
    "support.function.dslql.llmthink",
    "variable.other.reference.dslql.llmthink",
  ]) {
    assert.ok(scopes.has(scope), `missing syntax scope: ${scope}`);
  }
});
