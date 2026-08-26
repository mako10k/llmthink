import assert from "node:assert/strict";
import test from "node:test";

import {
  collectDslqlReferenceIds,
  collectDslqlReferences,
  createDocumentDslqlRuntime,
  createSemanticDslqlRuntime,
  DslqlEvaluationError,
  DslqlAstValidationError,
  DslqlParseError,
  DslqlSemanticError,
  DslqlSemanticUnavailableError,
  evaluateDslqlExpression,
  evaluateSemanticDslqlExpression,
  evaluateSemanticDocumentDslqlExpression,
  formatDslqlExpression,
  parseDslqlExpression,
  transformDslqlAst,
  usesSemanticDslql,
  validateDslqlAst,
  visitDslqlAst,
  type DslqlRuntime,
  type DslqlValue,
} from "../../src/dslql/query.ts";
import { createDocumentDeclarationIndex } from "../../src/model/declarations.ts";
import { parseDocument } from "../../src/parser/parser.ts";
import { deterministicSemanticEmbedder } from "../support/semantic-embedder.ts";

function createRuntime(): DslqlRuntime {
  return {
    root: {
      steps: [
        {
          id: "D2",
          role: "decision",
          score: 2,
          text: "second",
          tags: ["beta", "other"],
        },
        {
          id: "D1",
          role: "decision",
          score: 1,
          text: "first",
          tags: ["alpha"],
        },
        {
          id: "D1",
          role: "decision",
          score: 1,
          text: "duplicate",
          tags: ["alpha"],
        },
        {
          id: "EV1",
          role: "evidence",
          score: 3,
          text: "evidence",
          tags: ["shared"],
        },
      ],
    },
  };
}

const DOCUMENT_SOURCE = `
domain Design:
  description "設計対象"

problem P1:
  "第一の問題"

problem P2:
  "第二の問題"

step S1:
  evidence EV1:
    "第一の根拠"

step S2:
  decision D1 based_on P1, EV1:
    "第一の判断"

step S3:
  decision D2 based_on P2:
    "第二の判断"

step S4:
  pending PD1:
    "未解決"

query Q1:
  .document.problems[] | select(.id == @P1) | related_decisions()
`;

test("parser exposes a ranged, discriminated AST", () => {
  const source = '.steps[] | select(.role in ["decision", "pending"])';
  const expression = parseDslqlExpression(source);
  assert.equal(expression.kind, "pipe");
  assert.deepEqual(expression.range.start, { offset: 0, line: 1, column: 1 });
  assert.equal(expression.range.end.offset, source.length);

  const kinds: string[] = [];
  visitDslqlAst(expression, (node) => kinds.push(node.kind));
  assert.ok(kinds.includes("path"));
  assert.ok(kinds.includes("iterate"));
  assert.ok(kinds.includes("array"));
});

test("parser rejects ambiguous bare function names and chained comparisons", () => {
  assert.throws(
    () => parseDslqlExpression("related_decisions"),
    DslqlParseError,
  );
  assert.throws(() => parseDslqlExpression(".score < 2 < 3"), DslqlParseError);
  assert.throws(
    () => parseDslqlExpression(".[9007199254740993]"),
    /safe integer/,
  );
});

test("public AST boundaries reject invalid and cyclic hand-built nodes", () => {
  const range = {
    start: { offset: 0, line: 1, column: 1 },
    end: { offset: 1, line: 1, column: 2 },
  };
  const invalidNumber = {
    kind: "literal",
    value: Number.NaN,
    range,
  } as const;
  assert.throws(() => validateDslqlAst(invalidNumber), DslqlAstValidationError);
  assert.throws(
    () => formatDslqlExpression(invalidNumber),
    DslqlAstValidationError,
  );
  assert.throws(
    () => evaluateDslqlExpression(invalidNumber, createRuntime()),
    DslqlAstValidationError,
  );

  const invalidIndex = {
    kind: "path",
    origin: "current",
    segments: [{ kind: "index", index: -1, optional: false, range }],
    range,
  } as const;
  assert.throws(() => visitDslqlAst(invalidIndex, () => {}), /safe integer/);

  const invalidRange = {
    kind: "reference",
    id: "P1",
    range: { start: range.end, end: range.start },
  } as const;
  assert.throws(() => validateDslqlAst(invalidRange), /range/);

  const duplicateFields = {
    kind: "object",
    fields: [
      { kind: "field", key: "id", value: invalidRange, range },
      { kind: "field", key: "id", value: invalidRange, range },
    ],
    range,
  } as const;
  assert.throws(
    () => validateDslqlAst(duplicateFields),
    /Duplicate object field/,
  );

  const cyclic = {
    kind: "array",
    elements: [],
    range,
  } as unknown as {
    kind: "array";
    elements: unknown[];
    range: typeof range;
  };
  cyclic.elements.push(cyclic);
  assert.throws(() => validateDslqlAst(cyclic as never), /cycle|shared node/i);

  assert.throws(
    () =>
      transformDslqlAst(parseDslqlExpression("@P1"), (node) =>
        node.kind === "reference" ? invalidRange : undefined,
      ),
    DslqlAstValidationError,
  );
});

test("formatter round-trips canonical syntax", () => {
  const source =
    '.steps[]|select((.role=="decision" or .role=="pending") and not .hidden?)|map({id:.id,tags:[.tags[]?]})';
  const formatted = formatDslqlExpression(parseDslqlExpression(source));
  assert.equal(
    formatted,
    '.steps[] | select((.role == "decision" or .role == "pending") and not .hidden?) | map({id: .id, tags: [.tags[]?]})',
  );
  assert.equal(
    formatDslqlExpression(parseDslqlExpression(formatted)),
    formatted,
  );
});

test("references are explicit, ranged, and transformable", () => {
  const expression = parseDslqlExpression(
    ".problems[] | select(.id == @P1 or @P1 == .parent_id)",
  );
  assert.deepEqual(collectDslqlReferenceIds(expression), ["P1"]);
  assert.deepEqual(
    collectDslqlReferences(expression).map(
      (reference) => reference.range.start.offset,
    ),
    [28, 35],
  );
  assert.deepEqual(
    collectDslqlReferenceIds('.problems[] | select(.id == "P1")'),
    [],
  );

  const renamed = transformDslqlAst(expression, (node) => {
    if (node.kind === "reference") {
      return { ...node, id: "P2" };
    }
    if (node.kind === "property" && node.key === "parent_id") {
      return { ...node, key: "parent_ref" };
    }
    return undefined;
  });
  assert.equal(
    formatDslqlExpression(renamed),
    ".problems[] | select(.id == @P2 or @P2 == .parent_ref)",
  );
});

test("evaluation accepts an AST and applies stream transforms consistently", () => {
  const runtime = createRuntime();
  const ast = parseDslqlExpression(
    '.steps[] | select(.role == "decision") | sort_by(.score) | unique_by(.id) | limit(2) | map({id: .id, text: .text})',
  );
  assert.deepEqual(evaluateDslqlExpression(ast, runtime), [
    { id: "D1", text: "first" },
    { id: "D2", text: "second" },
  ]);
});

test("array construction collects streams without discarding values", () => {
  assert.deepEqual(
    evaluateDslqlExpression(
      '.steps[] | select(.role == "decision") | [.id]',
      createRuntime(),
    ),
    [["D2", "D1", "D1"]],
  );
  assert.deepEqual(
    evaluateDslqlExpression('["decision", "pending"]', createRuntime()),
    [["decision", "pending"]],
  );
});

test("in and string/array predicates cover the documented condition surface", () => {
  const runtime = createRuntime();
  assert.deepEqual(
    evaluateDslqlExpression(
      '.steps[] | select(.role in ["decision", "pending"] and (.text | starts_with("f"))) | map(.id)',
      runtime,
    ),
    ["D1"],
  );
  assert.deepEqual(
    evaluateDslqlExpression(
      '.steps[] | select(.tags | contains("shared")) | map(.id)',
      runtime,
    ),
    ["EV1"],
  );
});

test("required and optional navigation have distinct behavior", () => {
  assert.throws(
    () => evaluateDslqlExpression(".missing", createRuntime()),
    DslqlEvaluationError,
  );
  assert.deepEqual(evaluateDslqlExpression(".missing?", createRuntime()), []);
  assert.deepEqual(evaluateDslqlExpression(".steps[99]?", createRuntime()), []);
});

test("strict evaluation rejects lossy projections and type-coerced ordering", () => {
  const runtime = createRuntime();
  assert.throws(
    () => evaluateDslqlExpression(".steps | {ids: .[]}", runtime),
    /must produce at most one value/,
  );
  assert.throws(
    () => evaluateDslqlExpression('.steps[0].score > "1"', runtime),
    /same type/,
  );
  assert.throws(
    () => evaluateDslqlExpression("unknown()", runtime),
    /Unknown function/,
  );
  assert.throws(
    () => evaluateDslqlExpression(".steps[] | select(.tags[])", runtime),
    /select\(\) predicate must produce at most one value/,
  );
  assert.throws(() => parseDslqlExpression("1e999"), /must be finite/);
});

test("custom functions receive the input stream and can evaluate argument ASTs", () => {
  const seen: DslqlValue[][] = [];
  const runtime: DslqlRuntime = {
    root: { values: [1, 2, 3] },
    functions: {
      add: ({ input, arguments: args, evaluate }) => {
        seen.push([...input]);
        const increment = evaluate(args[0]!, input.slice(0, 1))[0];
        return input.map((value) => Number(value) + Number(increment));
      },
    },
  };
  assert.deepEqual(
    evaluateDslqlExpression(".values[] | add(10)", runtime),
    [11, 12, 13],
  );
  assert.deepEqual(seen, [[1, 2, 3]]);
});

test("document runtime mirrors the complete structural AST", () => {
  const document = parseDocument(DOCUMENT_SOURCE);
  assert.deepEqual(
    createDocumentDeclarationIndex(document).declarations.map(
      ({ id, kind }) => `${kind}:${id}`,
    ),
    [
      "domain:Design",
      "problem:P1",
      "problem:P2",
      "step:S1",
      "statement:EV1",
      "step:S2",
      "statement:D1",
      "step:S3",
      "statement:D2",
      "step:S4",
      "statement:PD1",
      "query:Q1",
    ],
  );
  const runtime = createDocumentDslqlRuntime(document);
  assert.deepEqual(
    evaluateDslqlExpression(
      ".document.steps[] | map({step_id: .id, role: .statement.role, syntax: .syntax.step})",
      runtime,
    ),
    [
      { step_id: "S1", role: "evidence", syntax: "explicit" },
      { step_id: "S2", role: "decision", syntax: "explicit" },
      { step_id: "S3", role: "decision", syntax: "explicit" },
      { step_id: "S4", role: "pending", syntax: "explicit" },
    ],
  );
  assert.deepEqual(
    evaluateDslqlExpression(
      ".document.domains[0] | {kind: .node_kind, body_syntax: .description_body.syntax, line: .span.line}",
      runtime,
    ),
    [{ kind: "domain", body_syntax: "quoted", line: 2 }],
  );
});

test("document runtime projects evidence resources as ordered anonymous values", () => {
  const sha256 =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const document = parseDocument(`
evidence EV1:
  "Resource metadata is structural provenance"
  resource:
    file "docs/spec.md"
  resource:
    url "https://example.test/spec.pdf"
    digest "sha256:${sha256}"
    mime "application/pdf"
    label "Published specification"
`);
  const runtime = createDocumentDslqlRuntime(document);

  assert.deepEqual(
    evaluateDslqlExpression(
      '.document.steps[].statement | select(.role == "evidence") | .resources[]',
      runtime,
    ),
    [
      {
        node_kind: "evidence_resource",
        locator_kind: "file",
        locator: "docs/spec.md",
        digest: null,
        mime: null,
        label: null,
        span: { line: 4, column: 3 },
      },
      {
        node_kind: "evidence_resource",
        locator_kind: "url",
        locator: "https://example.test/spec.pdf",
        digest: `sha256:${sha256}`,
        mime: "application/pdf",
        label: "Published specification",
        span: { line: 6, column: 3 },
      },
    ],
  );
  assert.deepEqual(
    createDocumentDeclarationIndex(document).declarations.map(({ id }) => id),
    ["S-EV1", "EV1"],
  );
});

test("evidence resource metadata does not expand semantic text", async () => {
  const digest = `sha256:${"a".repeat(64)}`;
  const document = parseDocument(`
evidence EV1:
  "Canonical evidence text"
  resource:
    url "https://example.test/secret-metadata"
    label "Resource-only label"
  resource:
    file "private/resource-notes.txt"
    digest "${digest}"
    mime "text/plain"
    label "Local notes"
  resource:
    blob "${digest}"
`);
  const batches: string[][] = [];

  await evaluateSemanticDocumentDslqlExpression(
    'similarity(@EV1, "query literal")',
    document,
    {
      embedder: async (texts) => {
        batches.push(texts);
        return {
          embeddings: texts.map(() => [1, 0]),
          provider: "deterministic",
          model: "resource-boundary",
        };
      },
    },
  );

  assert.deepEqual(batches, [["Canonical evidence text", "query literal"]]);
});

test("document runtime preserves framework, annotations, and role-specific nodes", () => {
  const source = `
framework Review:
  requires problem

domain Design:
  description "設計対象"

problem P1:
  "比較対象"
  annotation rationale:
    "比較理由"

step S1:
  viewpoint VP1:
    axis cost

step S2:
  partition PT1 on Design axis cost:
    Low := cost < 10
    Others := not Low

step S3:
  decision D1 based_on P1:
    "第一案"

step S4:
  decision D2 based_on P1:
    "第二案"

step S5:
  comparison CMP1 on P1 viewpoint VP1 relation preferred_over D1, D2:
    "第一案を優先する"
`;
  const runtime = createDocumentDslqlRuntime(parseDocument(source));
  assert.deepEqual(
    evaluateDslqlExpression(
      ".document.framework | {id: .id, rule_kinds: [.rules[].rule_kind]}",
      runtime,
    ),
    [{ id: "Review", rule_kinds: ["requires"] }],
  );
  assert.deepEqual(
    evaluateDslqlExpression(
      ".document.problems[0] | {annotation: .annotations[0].annotation_kind, body: .text_body.syntax}",
      runtime,
    ),
    [{ annotation: "rationale", body: "quoted" }],
  );
  assert.deepEqual(
    evaluateDslqlExpression(
      '.document.steps[].statement | select(.role in ["viewpoint", "partition", "comparison"]) | map({role: .role, axis: .axis?, domain: .domain_id?, relation: .relation?, members: .members?})',
      runtime,
    ),
    [
      { role: "viewpoint", axis: "cost" },
      {
        role: "partition",
        axis: "cost",
        domain: "Design",
        members: [
          { name: "Low", predicate: "cost < 10" },
          { name: "Others", predicate: "not Low" },
        ],
      },
      { role: "comparison", relation: "preferred_over" },
    ],
  );
});

test("document relation functions respect their input and direction", () => {
  const runtime = createDocumentDslqlRuntime(parseDocument(DOCUMENT_SOURCE));
  assert.deepEqual(
    evaluateDslqlExpression(
      ".document.problems[] | select(.id == @P1) | related_decisions() | map(.id)",
      runtime,
    ),
    ["D1"],
  );
  assert.throws(
    () =>
      evaluateDslqlExpression(
        ".document.problems[0] | related_decisions(1)",
        runtime,
      ),
    /expects no arguments/,
  );
  assert.deepEqual(
    evaluateDslqlExpression(
      ".document.steps[].statement | select(.id == @D1) | based_on_refs() | map(.id)",
      runtime,
    ),
    ["P1", "EV1"],
  );
  assert.deepEqual(
    evaluateDslqlExpression(
      '.document.steps[].statement | select(.role == "pending") | based_on_refs()',
      runtime,
    ),
    [],
  );
  assert.deepEqual(
    evaluateDslqlExpression(
      ".document.problems[] | select(.id == @P1) | downstream() | map(.id)",
      runtime,
    ),
    ["D1"],
  );
});

test("context functions cover audit, pending, and score views", () => {
  const runtime = createDocumentDslqlRuntime(parseDocument(DOCUMENT_SOURCE), {
    audit: {
      results: [
        { id: "I1", severity: "warning" },
        { id: "I2", severity: "info" },
      ],
    },
    search: [
      { id: "T1", score: 0.8 },
      { id: "T2", score: 0.2 },
    ],
  });
  assert.deepEqual(
    evaluateDslqlExpression(
      '.audit | audit_findings("warning") | map(.id)',
      runtime,
    ),
    ["I1"],
  );
  assert.deepEqual(
    evaluateDslqlExpression(".document | has_open_pending()", runtime),
    [true],
  );
  assert.deepEqual(
    evaluateDslqlExpression(".search[] | sort_by(score()) | map(.id)", runtime),
    ["T2", "T1"],
  );
});

test("semantic runtime separates scoring, predicates, and stream ranking", async () => {
  const document = parseDocument(`
problem P_COST:
  "運用コストを抑える"

step S1:
  decision D_COST based_on P_COST:
    "安価な構成で運用コストを下げる"

step S2:
  decision D_SPEED based_on P_COST:
    "応答速度を最優先する"
`);
  const embedder = deterministicSemanticEmbedder;

  const byReference = await evaluateSemanticDocumentDslqlExpression(
    '.document.steps[].statement | select(.role == "decision") | nearest_to(@P_COST, 0.5) | map({id: .node.id, score: .score, provider: .provider})',
    document,
    { embedder },
  );
  assert.deepEqual(byReference, [
    { id: "D_COST", score: 1, provider: "deterministic" },
  ]);

  const byText = await evaluateSemanticDocumentDslqlExpression(
    '.document.steps[].statement | select(.role == "decision") | nearest_to("速度") | limit(1) | map(.node.id)',
    document,
    { embedder },
  );
  assert.deepEqual(byText, ["D_SPEED"]);

  const predicateAndScore = await evaluateSemanticDocumentDslqlExpression(
    '.document.steps[].statement | select(.role == "decision" and similar_to(., "コスト", 0.5)) | map({id: .id, score: similarity(., "コスト")})',
    document,
    { embedder },
  );
  assert.deepEqual(predicateAndScore, [{ id: "D_COST", score: 1 }]);

  assert.deepEqual(
    await evaluateSemanticDocumentDslqlExpression(
      '.document.steps[].statement | select(.role == "decision") | map(similarity(., .))',
      document,
      { embedder },
    ),
    [1, 1],
  );

  assert.deepEqual(
    await evaluateSemanticDocumentDslqlExpression(
      'similarity("速度", "速度")',
      document,
      { embedder },
    ),
    [1],
  );
  assert.deepEqual(
    await evaluateSemanticDocumentDslqlExpression(
      'similar_to("速度", @P_COST, 0.5)',
      document,
      { embedder },
    ),
    [false],
  );
});

test("semantic evaluation keeps provider and target failures explicit", async () => {
  const document = parseDocument(DOCUMENT_SOURCE);
  assert.equal(usesSemanticDslql("similarity(., @P1)"), true);
  assert.equal(usesSemanticDslql(".document | nearest_to(@P1)"), true);
  assert.equal(usesSemanticDslql(".document | has_open_pending()"), false);

  await assert.rejects(
    () =>
      evaluateSemanticDocumentDslqlExpression(
        ".document.steps[].statement | nearest_to(@P1)",
        document,
        { embedder: async () => undefined },
      ),
    DslqlSemanticUnavailableError,
  );
  await assert.rejects(
    () =>
      evaluateSemanticDocumentDslqlExpression(
        ".document.steps[].statement | select(similar_to(.text, @P1, 0.5))",
        document,
        {
          embedder: async () => {
            throw new Error("embedder must not be called");
          },
        },
      ),
    DslqlSemanticError,
  );
  await assert.rejects(
    () =>
      evaluateSemanticDocumentDslqlExpression(
        '.document.steps[].statement | nearest_to("", 1.1)',
        document,
        {
          embedder: async () => {
            throw new Error("embedder must not be called");
          },
        },
      ),
    DslqlSemanticError,
  );
  await assert.rejects(
    () =>
      evaluateSemanticDocumentDslqlExpression(
        'similarity(concat("a", "b"), @P1)',
        document,
        {
          embedder: async () => {
            throw new Error("embedder must not be called");
          },
        },
      ),
    DslqlSemanticError,
  );
});

test("generic semantic runtime accepts an explicit text selector", async () => {
  const runtime: DslqlRuntime = {
    root: {
      items: [
        { id: "A", payload: "alpha" },
        { id: "B", payload: "beta" },
      ],
    },
  };
  const expression =
    '.items[] | nearest_to("alpha") | nearest_to("beta") | map(.node.id)';
  const batches: string[][] = [];
  const semanticRuntime = await createSemanticDslqlRuntime(
    runtime,
    expression,
    {
      selectText: (value) =>
        typeof value.payload === "string" ? value.payload : undefined,
      embedder: async (texts) => {
        batches.push(texts);
        return {
          embeddings: texts.map((text) => (text === "beta" ? [0, 1] : [1, 0])),
          provider: "deterministic",
          model: "custom-selector",
        };
      },
    },
  );
  assert.deepEqual(evaluateDslqlExpression(expression, semanticRuntime), [
    "B",
    "A",
  ]);
  assert.deepEqual(batches, [["alpha", "beta"]]);
});

test("generic semantic references reject ambiguous IDs instead of last-wins", async () => {
  const runtime: DslqlRuntime = {
    root: {
      items: [
        { id: "A", text: "first" },
        { id: "A", text: "second" },
      ],
    },
  };
  await assert.rejects(
    () =>
      evaluateSemanticDslqlExpression('similarity(@A, "target")', runtime, {
        embedder: async () => {
          throw new Error("embedder must not be called");
        },
      }),
    /ambiguous semantic reference 'A'/,
  );
});

test("semantic references distinguish unresolved and non-text-bearing IDs", async () => {
  const runtime: DslqlRuntime = {
    root: { items: [{ id: "EMPTY", count: 1 }] },
  };
  await assert.rejects(
    () =>
      evaluateSemanticDslqlExpression(
        'similarity(@MISSING, "target")',
        runtime,
        {
          embedder: async () => {
            throw new Error("embedder must not be called");
          },
        },
      ),
    /unresolved semantic reference 'MISSING'/,
  );
  await assert.rejects(
    () =>
      evaluateSemanticDslqlExpression('similarity(@EMPTY, "target")', runtime, {
        embedder: async () => {
          throw new Error("embedder must not be called");
        },
      }),
    /semantic reference 'EMPTY' has no text-bearing node/,
  );
});

test("literal-only similarity embeds only distinct demanded literals", async () => {
  const batches: string[][] = [];
  const runtime: DslqlRuntime = {
    root: { items: [{ text: "unrelated runtime object" }] },
  };
  const values = await evaluateSemanticDslqlExpression(
    '[similarity("alpha", "beta"), similarity("alpha", "alpha")]',
    runtime,
    {
      embedder: async (texts) => {
        batches.push(texts);
        return {
          embeddings: texts.map((text) => (text === "alpha" ? [1, 0] : [0, 1])),
          provider: "deterministic",
          model: "literal-cache",
        };
      },
    },
  );
  assert.deepEqual(values, [[0, 1]]);
  assert.deepEqual(batches, [["alpha", "beta"]]);
});

test("on-demand literal budget is checked before embedding I/O", async () => {
  await assert.rejects(
    () =>
      evaluateSemanticDslqlExpression(
        'similarity("alpha", "beta")',
        { root: {} },
        {
          maxOnDemandEmbeddings: 1,
          embedder: async () => {
            throw new Error("embedder must not be called");
          },
        },
      ),
    DslqlSemanticError,
  );
});
