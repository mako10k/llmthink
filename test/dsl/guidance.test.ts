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
