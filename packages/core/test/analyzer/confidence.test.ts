import assert from "node:assert/strict";
import test from "node:test";

import {
  auditDslText,
  ConfidenceValueError,
  confidenceKeywordsFor,
  createConfidenceAssessment,
  createDocumentDslqlRuntime,
  createRationalValue,
  evaluateConfidence,
  evaluateDslqlExpression,
  formatAuditReportText,
  formatDslText,
  parseDocument,
  parseUnitRational,
  rationalToString,
  resolveConfidenceKeyword,
} from "../../src/index.ts";

test("confidence rationals normalize exactly and reject values outside the unit interval", () => {
  assert.deepEqual(parseUnitRational("18/20"), {
    numerator: "9",
    denominator: "10",
  });
  assert.throws(() => parseUnitRational("11/10"), ConfidenceValueError);
  assert.throws(() => parseUnitRational("1/0"), ConfidenceValueError);
  assert.throws(() => parseUnitRational("0.9"), ConfidenceValueError);
  assert.throws(
    () =>
      createConfidenceAssessment({
        lower: createRationalValue(-1n, 2n),
        estimate: createRationalValue(1n, 2n),
        upper: createRationalValue(1n, 1n),
        epistemicTag: "estimated",
        origin: "explicit",
      }),
    /within 0\/1 and 1\/1/,
  );
  const point = parseUnitRational("1/2");
  assert.throws(
    () =>
      createConfidenceAssessment({
        lower: point,
        estimate: point,
        upper: point,
        epistemicTag: "estimated",
        origin: "keyword",
      }),
    /identify its profile keyword/,
  );
  assert.throws(
    () =>
      createConfidenceAssessment({
        lower: point,
        estimate: point,
        upper: point,
        epistemicTag: "estimated",
        origin: "explicit",
        keywordId: "strong_assumption",
      }),
    /Only keyword confidence/,
  );
});

test("parser and formatter preserve explicit and default confidence declarations", () => {
  const source = `
evidence EV1:
  "Measured input"

decision D1 based_on EV1:
  "Derived result"

confidence EV1:
  epistemic known
  range 9/10..9/10
  estimate 9/10

confidence EV1 -> D1:
  default
`;
  const document = parseDocument(source);

  assert.equal(document.confidence.length, 2);
  assert.deepEqual(document.confidence[0], {
    kind: "source",
    sourceId: "EV1",
    assessment: {
      lower: { numerator: "9", denominator: "10" },
      estimate: { numerator: "9", denominator: "10" },
      upper: { numerator: "9", denominator: "10" },
      epistemicTag: "known",
      origin: "explicit",
      profileId: "support-trace-v1",
    },
    syntax: "explicit",
    span: { line: 8, column: 1 },
  });
  assert.equal(document.confidence[1]?.kind, "edge");
  assert.equal(document.confidence[1]?.syntax, "default");

  const formatted = formatDslText(source);
  assert.match(
    formatted,
    /confidence EV1:\n {2}estimate 9\/10\n {2}range 9\/10\.\.9\/10\n {2}epistemic known/,
  );
  assert.match(formatted, /confidence EV1 -> D1:\n {2}default/);
  assert.equal(formatDslText(formatted), formatted);
});

test("support-trace-v1 expands versioned source and edge keywords exactly", () => {
  const expectedSourceEstimates = [
    "1/1",
    "99/100",
    "9/10",
    "4/5",
    "1/2",
    "1/4",
    "1/8",
    "1/100",
  ];
  assert.deepEqual(
    confidenceKeywordsFor("source").map((keyword) =>
      rationalToString(resolveConfidenceKeyword("source", keyword).estimate),
    ),
    expectedSourceEstimates,
  );
  assert.deepEqual(
    confidenceKeywordsFor("edge").map((keyword) =>
      rationalToString(resolveConfidenceKeyword("edge", keyword).estimate),
    ),
    expectedSourceEstimates,
  );
  assert.deepEqual(resolveConfidenceKeyword("source", "strong_assumption"), {
    lower: { numerator: "17", denominator: "20" },
    estimate: { numerator: "9", denominator: "10" },
    upper: { numerator: "19", denominator: "20" },
    epistemicTag: "estimated",
    origin: "keyword",
    profileId: "support-trace-v1",
    keywordId: "strong_assumption",
  });
});

test("keyword confidence syntax preserves provenance and enforces source and edge vocabularies", () => {
  const source = `
evidence EV1:
  "Input"

decision D1 based_on EV1:
  "Output"

confidence EV1:
  keyword strong_assumption

confidence EV1 -> D1:
  keyword approximate_inference
`;
  const document = parseDocument(source);
  const results = evaluateConfidence(document);

  assert.equal(document.confidence[0]?.syntax, "keyword");
  assert.deepEqual(
    results.find((result) => result.target_id === "EV1")?.assessment,
    {
      lower: "17/20",
      estimate: "9/10",
      upper: "19/20",
      epistemic_tag: "estimated",
      origin: "keyword",
      profile_id: "support-trace-v1",
      keyword_id: "strong_assumption",
    },
  );
  assert.deepEqual(
    results.find((result) => result.target_id === "D1")?.assessment,
    {
      lower: "119/200",
      estimate: "18/25",
      upper: "171/200",
      epistemic_tag: "estimated",
      origin: "derived",
      profile_id: "support-trace-v1",
    },
  );
  assert.deepEqual(
    evaluateDslqlExpression(
      '.document.confidence[] | select(.confidence_kind == "source") | .assessment.keyword_id',
      createDocumentDslqlRuntime(document),
    ),
    ["strong_assumption"],
  );
  const formatted = formatDslText(source);
  assert.match(formatted, /keyword strong_assumption/);
  assert.match(formatted, /keyword approximate_inference/);
  assert.equal(formatDslText(formatted), formatted);

  assert.throws(
    () =>
      parseDocument(`
evidence EV1:
  "Input"

confidence EV1:
  keyword strong_inference
`),
    /Unknown source confidence keyword 'strong_inference'/,
  );
  assert.throws(
    () =>
      parseDocument(`
evidence EV1:
  "Input"

decision D1 based_on EV1:
  "Output"

confidence EV1 -> D1:
  keyword strong_assumption
`),
    /Unknown edge confidence keyword 'strong_assumption'/,
  );
});

test("declared confidence stays separate from derived confidence and audits interval disagreement", async () => {
  const source = `
evidence EV1:
  "Input"

decision D1 based_on EV1:
  "Derived decision"

confidence EV1:
  estimate 1/2
  range 1/2..1/2
  epistemic estimated

confidence EV1 -> D1:
  keyword exact_transform

declared_confidence D1:
  keyword strong_assumption
`;
  const document = parseDocument(source);
  const result = evaluateConfidence(document).find(
    (candidate) => candidate.target_id === "D1",
  );

  assert.equal(document.confidence[2]?.kind, "declared");
  assert.deepEqual(result?.assessment, {
    lower: "1/2",
    estimate: "1/2",
    upper: "1/2",
    epistemic_tag: "estimated",
    origin: "derived",
    profile_id: "support-trace-v1",
  });
  assert.deepEqual(result?.declared_assessment, {
    lower: "17/20",
    estimate: "9/10",
    upper: "19/20",
    epistemic_tag: "estimated",
    origin: "keyword",
    profile_id: "support-trace-v1",
    keyword_id: "strong_assumption",
  });
  assert.deepEqual(result?.declared_comparison, {
    relation: "above_derived_interval",
  });
  assert.deepEqual(
    evaluateDslqlExpression(
      '.document.confidence_results[] | select(.target_id == "D1") | .declared_comparison.relation',
      createDocumentDslqlRuntime(document),
    ),
    ["above_derived_interval"],
  );
  assert.match(
    formatDslText(source),
    /declared_confidence D1:\n {2}keyword strong_assumption/,
  );

  const report = await auditDslText(source);
  assert.ok(
    report.results.some(
      (issue) =>
        issue.category === "semantic_hint" &&
        issue.severity === "warning" &&
        issue.metadata?.declared_confidence_relation ===
          "above_derived_interval",
    ),
  );
});

test("declared confidence requires a derived target and rejects an unintentional default", () => {
  const unresolved = evaluateConfidence(
    parseDocument(`
evidence EV1:
  "Input"

declared_confidence EV1:
  keyword strong_assumption
`),
  ).find((result) => result.target_id === "EV1");
  assert.equal(unresolved?.status, "uncomputable");
  assert.match(unresolved?.reasons[0] ?? "", /requires incoming scoring edges/);
  assert.ok(unresolved?.declared_assessment);

  assert.throws(
    () =>
      parseDocument(`
decision D1:
  "Decision"

declared_confidence D1:
  default
`),
    /must use an explicit assessment or keyword/,
  );
});

test("declared confidence compares exact estimates with derived interval boundaries", () => {
  const relationFor = (estimate: string) => {
    const document = parseDocument(`
evidence EV1:
  "Input"

decision D1 based_on EV1:
  "Derived decision"

confidence EV1:
  estimate 3/5
  range 1/2..3/4
  epistemic estimated

confidence EV1 -> D1:
  keyword exact_transform

declared_confidence D1:
  estimate ${estimate}
  range ${estimate}..${estimate}
  epistemic estimated
`);
    return evaluateConfidence(document).find(
      (result) => result.target_id === "D1",
    )?.declared_comparison?.relation;
  };

  assert.equal(relationFor("1/3"), "below_derived_interval");
  assert.equal(relationFor("1/2"), "within_derived_interval");
  assert.equal(relationFor("4/5"), "above_derived_interval");
});

test("audit output exposes confidence results without turning computed values into issues", async () => {
  const report = await auditDslText(`
evidence EV1:
  "Input"

decision D1 based_on EV1:
  "Output"

confidence EV1 -> D1:
  default
`);

  assert.equal(report.confidence_results?.length, 2);
  assert.equal(
    report.results.some((issue) => issue.message.includes("confidence")),
    false,
  );
  assert.match(
    formatAuditReportText(report),
    /D1: 19\/40 \[9\/40\.\.3\/4\] epistemic=unknown/,
  );
});

test("DSLQL exposes exact confidence declarations and derived results", () => {
  const runtime = createDocumentDslqlRuntime(
    parseDocument(`
evidence EV1:
  "Input"

decision D1 based_on EV1:
  "Output"

confidence EV1 -> D1:
  default
`),
  );

  assert.deepEqual(
    evaluateDslqlExpression(
      '.document.confidence_results[] | select(.target_id == "D1") | .assessment.estimate',
      runtime,
    ),
    ["19/40"],
  );
});

test("confidence propagation keeps numeric defaults while tagging unknown causes", () => {
  const document = parseDocument(`
evidence EV1:
  "Unassessed evidence"

decision D1 based_on EV1:
  "First transformation"

decision D2 based_on D1:
  "Second transformation"

confidence EV1 -> D1:
  default

confidence D1 -> D2:
  default
`);

  const results = evaluateConfidence(document);
  const source = results.find((result) => result.target_id === "EV1");
  const first = results.find((result) => result.target_id === "D1");
  const second = results.find((result) => result.target_id === "D2");

  assert.deepEqual(source?.assessment, {
    lower: "1/4",
    estimate: "1/2",
    upper: "3/4",
    epistemic_tag: "unknown",
    origin: "default",
    profile_id: "support-trace-v1",
  });
  assert.deepEqual(first?.assessment, {
    lower: "9/40",
    estimate: "19/40",
    upper: "3/4",
    epistemic_tag: "unknown",
    origin: "derived",
    profile_id: "support-trace-v1",
  });
  assert.deepEqual(second?.assessment, {
    lower: "81/400",
    estimate: "361/800",
    upper: "3/4",
    epistemic_tag: "unknown",
    origin: "derived",
    profile_id: "support-trace-v1",
  });
  assert.deepEqual(second?.weakest_path, ["EV1", "D1", "D2"]);
  assert.deepEqual(second?.cause_ids, ["EV1", "EV1->D1", "D1->D2"]);
});

test("confidence propagation preserves an explicit interval independently from its tag", () => {
  const results = evaluateConfidence(
    parseDocument(`
evidence EV1:
  "Measured input"

decision D1 based_on EV1:
  "Estimated inference"

confidence EV1:
  estimate 9/10
  range 9/10..9/10
  epistemic known

confidence EV1 -> D1:
  estimate 4/5
  range 1/2..9/10
  epistemic estimated
`),
  );
  const result = results.find((candidate) => candidate.target_id === "D1");

  assert.deepEqual(result?.assessment, {
    lower: "9/20",
    estimate: "18/25",
    upper: "81/100",
    epistemic_tag: "estimated",
    origin: "derived",
    profile_id: "support-trace-v1",
  });
  assert.deepEqual(result?.cause_ids, ["EV1->D1"]);
});

test("multi-parent confidence exposes a conservative baseline without applying a boost", () => {
  const results = evaluateConfidence(
    parseDocument(`
evidence E1:
  "Wide high estimate"

evidence E2:
  "Narrower lower estimate"

decision D1 based_on E1, E2:
  "Requires both supports"

decision D2 based_on D1:
  "Uses the unresolved multi-parent baseline"

confidence E1:
  estimate 9/10
  range 1/2..9/10
  epistemic estimated

confidence E2:
  estimate 4/5
  range 4/5..1/1
  epistemic estimated

confidence E1 -> D1:
  estimate 1/1
  range 1/1..1/1
  epistemic known

confidence E2 -> D1:
  estimate 1/1
  range 1/1..1/1
  epistemic known

confidence D1 -> D2:
  estimate 1/1
  range 1/1..1/1
  epistemic known
`),
  );
  const result = results.find((candidate) => candidate.target_id === "D1");
  const downstream = results.find((candidate) => candidate.target_id === "D2");

  assert.deepEqual(result?.assessment, {
    lower: "1/2",
    estimate: "4/5",
    upper: "9/10",
    epistemic_tag: "estimated",
    origin: "derived",
    profile_id: "support-trace-v1",
  });
  assert.deepEqual(result?.weakest_path, ["E2", "D1"]);
  assert.deepEqual(result?.cause_ids, ["E1", "E2"]);
  assert.deepEqual(result?.aggregation, {
    status: "unresolved_dependency",
    baseline_method: "coordinate_min",
    boost_applied: false,
    boosted_estimate: null,
    unresolved_nodes: [{ target_id: "D1", parent_count: 2 }],
  });
  assert.deepEqual(downstream?.aggregation, result?.aggregation);
  assert.deepEqual(
    evaluateDslqlExpression(
      '.document.confidence_results[] | select(.target_id == "D2") | .aggregation.status',
      createDocumentDslqlRuntime(
        parseDocument(
          formatDslText(`
evidence E1:
  "First"

evidence E2:
  "Second"

decision D1 based_on E1, E2:
  "Baseline"

decision D2 based_on D1:
  "Downstream"

confidence E1 -> D1:
  default

confidence E2 -> D1:
  default

confidence D1 -> D2:
  default
`),
        ),
      ),
    ),
    ["unresolved_dependency"],
  );
});

test("audit presentation labels multi-parent values as an unresolved conservative baseline", async () => {
  const report = await auditDslText(`
evidence E1:
  "First"

evidence E2:
  "Second"

decision D1 based_on E1, E2:
  "Baseline"

confidence E1 -> D1:
  default

confidence E2 -> D1:
  default
`);

  assert.match(
    formatAuditReportText(report),
    /aggregation: status=unresolved_dependency baseline=coordinate_min boost_applied=false boosted_estimate=unresolved nodes=D1\(2\)/,
  );
});

test("confidence propagation reports cycles and non-based_on scoring edges as uncomputable", () => {
  const cycleResults = evaluateConfidence(
    parseDocument(`
decision D1 based_on D2:
  "First"

decision D2 based_on D1:
  "Second"

confidence D2 -> D1:
  default

confidence D1 -> D2:
  default
`),
  );
  assert.equal(
    cycleResults.find((result) => result.target_id === "D1")?.status,
    "uncomputable",
  );
  assert.match(
    cycleResults.flatMap((result) => result.reasons).join("\n"),
    /confidence_cycle/,
  );

  const mismatch = evaluateConfidence(
    parseDocument(`
evidence EV1:
  "Input"

decision D1:
  "No based_on"

confidence EV1 -> D1:
  default
`),
  );
  assert.match(
    mismatch.find((result) => result.target_id === "D1")?.reasons[0] ?? "",
    /not declared by decision based_on/,
  );
});

test("confidence propagation does not let a source declaration override a derived node", () => {
  const results = evaluateConfidence(
    parseDocument(`
evidence EV1:
  "Input"

decision D1 based_on EV1:
  "Derived"

confidence D1:
  estimate 1/1
  range 1/1..1/1
  epistemic known

confidence EV1 -> D1:
  default
`),
  );

  assert.match(
    results.find((result) => result.target_id === "D1")?.reasons[0] ?? "",
    /cannot override derived confidence/,
  );
});

test("confidence arithmetic limits become uncomputable instead of aborting audit", async () => {
  const denominator = "9".repeat(256);
  const report = await auditDslText(`
evidence EV1:
  "Input"

decision D1 based_on EV1:
  "Derived"

confidence EV1:
  estimate 1/${denominator}
  range 1/${denominator}..1/${denominator}
  epistemic estimated

confidence EV1 -> D1:
  estimate 1/${denominator}
  range 1/${denominator}..1/${denominator}
  epistemic estimated
`);
  const derived = report.confidence_results?.find(
    (result) => result.target_id === "D1",
  );

  assert.equal(derived?.status, "uncomputable");
  assert.match(derived?.reasons[0] ?? "", /arithmetic limit/);
  assert.ok(
    report.results.some(
      (issue) =>
        issue.category === "semantic_hint" &&
        issue.severity === "warning" &&
        issue.target_refs.some((target) => target.ref_id === "D1"),
    ),
  );
});

test("parser rejects invalid confidence intervals and duplicates", () => {
  assert.throws(
    () =>
      parseDocument(`
evidence EV1:
  "Input"

confidence EV1:
  estimate 9/10
  range 1/1..1/2
  epistemic estimated
`),
    /lower <= estimate <= upper/,
  );
  assert.throws(
    () =>
      parseDocument(`
evidence EV1:
  "Input"

confidence EV1:
  default

confidence EV1:
  default
`),
    /Duplicate confidence declaration/,
  );
});
