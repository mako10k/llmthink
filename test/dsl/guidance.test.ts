import assert from "node:assert/strict";
import test from "node:test";

import {
  getDslSyntaxGuidanceText,
  isDslHelpRequest,
  parseDslHelpRequest,
} from "../../src/index.ts";

test("isDslHelpRequest accepts topic-scoped help commands", () => {
  assert.equal(isDslHelpRequest("dsl help query functions detail"), true);
  assert.equal(isDslHelpRequest("dsl audit"), false);
});

test("parseDslHelpRequest extracts topic, subtopic, and detail", () => {
  assert.deepEqual(parseDslHelpRequest("dsl help query functions detail"), {
    topic: "query",
    subtopic: "functions",
    detail: "detail",
  });
});

test("parseDslHelpRequest keeps topic-only detail requests without subtopic", () => {
  assert.deepEqual(parseDslHelpRequest("dsl help query detail"), {
    topic: "query",
    subtopic: undefined,
    detail: "detail",
  });
});

test("getDslSyntaxGuidanceText returns indexed overview by default", () => {
  const text = getDslSyntaxGuidanceText();
  assert.match(text, /LLMThink DSL Help/);
  assert.match(text, /Topic: overview/);
  assert.match(text, /Index/);
  assert.match(text, /query: DSLQL の root/);
});

test("getDslSyntaxGuidanceText returns query function detail with next requests", () => {
  const text = getDslSyntaxGuidanceText({
    topic: "query",
    subtopic: "functions",
    detail: "detail",
    channel: "cli",
  });
  assert.match(text, /Topic: query.functions/);
  assert.match(text, /related_decisions/);
  assert.match(text, /audit_findings/);
  assert.match(text, /Next Requests/);
  assert.match(text, /llmthink dsl help query functions detail/);
});

test("getDslSyntaxGuidanceText includes logical sample references for query topics", () => {
  const text = getDslSyntaxGuidanceText({
    topic: "query",
    subtopic: "examples",
    detail: "detail",
  });
  assert.match(text, /Example Samples/);
  assert.match(text, /query-assist/);
  assert.match(text, /query-unresolved/);
  assert.match(text, /resolved_path:/);
});

test("getDslSyntaxGuidanceText exposes sample detail help", () => {
  const text = getDslSyntaxGuidanceText({
    topic: "samples",
    subtopic: "query-assist",
    detail: "detail",
  });
  assert.match(text, /Topic: samples.query-assist/);
  assert.match(text, /解決済み query の代表例/);
  assert.match(text, /docs\/examples\/query-assist\.dsl/);
  assert.match(text, /resolved_path:/);
});

test("getDslSyntaxGuidanceText exposes comparison syntax guidance", () => {
  const text = getDslSyntaxGuidanceText({
    topic: "syntax",
    subtopic: "comparison",
    detail: "detail",
  });
  assert.match(text, /Topic: syntax.comparison/);
  assert.match(text, /preferred_over/);
  assert.match(text, /counterexample_to/);
  assert.match(text, /decision-comparison/);
});

test("getDslSyntaxGuidanceText exposes status annotations in decision guidance", () => {
  const text = getDslSyntaxGuidanceText({
    topic: "syntax",
    subtopic: "decision",
    detail: "detail",
  });
  assert.match(text, /annotation status/);
  assert.match(text, /rejected/);
});

test("getDslSyntaxGuidanceText lists use-case profiles for ideation and problem solving", () => {
  const text = getDslSyntaxGuidanceText({
    topic: "usecases",
  });
  assert.match(text, /- ideation:/);
  assert.match(text, /- problem-solving:/);
  assert.match(text, /- other-profiles:/);
});

test("getDslSyntaxGuidanceText exposes ideation profile aliases and samples", () => {
  const text = getDslSyntaxGuidanceText({
    topic: "usecases",
    subtopic: "ideation",
    detail: "detail",
  });
  assert.match(text, /idea seed/);
  assert.match(text, /cluster/);
  assert.match(text, /ideation-profile/);
  assert.match(text, /docs\/examples\/ideation-profile\.dsl/);
});
