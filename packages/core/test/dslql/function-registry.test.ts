import assert from "node:assert/strict";
import test from "node:test";

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
