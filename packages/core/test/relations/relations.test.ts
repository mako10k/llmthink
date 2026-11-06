// R: Verify additive relation semantics, profile boundaries and legacy support isolation.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  auditDslText,
  parseDocument,
  formatDocument,
  evaluateConfidence,
} from "../../src/index.ts";

const audit = (text: string) =>
  auditDslText(text, "relations", { embeddings: { provider: "none" } });
const profile = "framework Incident:\n  profile causal-impact-v1\n";
const rules = (report: Awaited<ReturnType<typeof audit>>) =>
  report.results.map((issue) => issue.metadata?.rule_id).filter(Boolean);
const source = readFileSync(
  new URL(
    "../../../../docs/examples/causal-impact-unknown.think",
    import.meta.url,
  ),
  "utf8",
);

test("unknown causes, separate impact chains and containment preserve unresolved review", async () => {
  const report = await audit(source);
  assert.equal(report.summary.fatal_count, 0);
  assert.equal(report.summary.error_count, 0);
  assert.ok(rules(report).includes("CI006"));
  assert.ok(rules(report).includes("CI011"));
  assert.ok(!rules(report).includes("CI004"));
  assert.ok(!rules(report).includes("CI007"));
  const rootOnly = source.replace(
    /\n {2}annotation todo:\n {4}"DB担当[^\n]+"/,
    "",
  );
  assert.ok(rules(await audit(rootOnly)).includes("CI009"));
});

test("old AST omits new fields and legacy audits are not activated by role notes", async () => {
  const legacy =
    'premise C:\n  "cause"\ndecision D based_on C:\n  "decision"\n';
  const ast = parseDocument(legacy);
  const node = ast.steps[1]!.statement;
  assert.equal("actsOn" in node, false);
  assert.equal("relations" in node, false);
  assert.ok(!rules(await audit(legacy)).length);
  assert.ok(
    !rules(await audit(legacy + '  annotation role:\n    "phenomenon"\n'))
      .length,
  );
});

test("formatter and DSLQL preserve both independent edges including mechanism block text", async () => {
  const text = `premise C:
  "cause"
decision M based_on C acts_on C:
  "measure"
  relation acts_on C:
    evidence C
    mechanism |
      first line
      second line
    status hypothesis
    kind intervention
  annotation rationale:
    "example"
  relation based_on C:
    kind support
query Q:
  .document.steps[].statement | select(.id == @M) | {support: .based_on, targets: .acts_on, relations: .relations}
`;
  const ast = parseDocument(text);
  const formatted = formatDocument(ast);
  assert.equal(formatDocument(parseDocument(formatted)), formatted);
  const node = parseDocument(formatted).steps[1]!.statement;
  assert.equal(node.role, "decision");
  if (node.role !== "decision") return;
  assert.deepEqual(node.basedOn, ["C"]);
  assert.deepEqual(node.actsOn, ["C"]);
  assert.equal(node.relations?.[0]?.mechanism, "first line\nsecond line");
  const report = await audit(formatted);
  assert.equal(report.summary.fatal_count, 0);
  const value = report.query_results[0]?.values[0] as Record<string, unknown>;
  assert.deepEqual(value.support, ["C"]);
  assert.deepEqual(value.targets, ["C"]);
  assert.equal((value.relations as unknown[]).length, 2);
});

test("action targets do not satisfy support, orphan or confidence obligations", async () => {
  const text = `premise C:
  "target"
decision M acts_on C:
  "action"
confidence C -> M:
  keyword reliable_inference
`;
  const report = await audit(text);
  assert.ok(report.results.some((r) => r.message.includes("根拠参照がない")));
  assert.ok(
    report.results.some(
      (r) =>
        r.target_refs.some((ref) => ref.ref_id === "C") &&
        r.metadata?.orphan_profile === "direct-v1",
    ),
  );
  const results = evaluateConfidence(parseDocument(text));
  assert.ok(results.some((r) => r.status === "uncomputable"));
});

test("relation contract errors, wrong namespaces and unknown profiles fail closed", async () => {
  const text = `premise C:
  "cause"
decision M based_on C acts_on Missing:
  "action"
  relation based_on C:
    kind mitigation
  relation based_on C:
    kind support
    evidence MissingEvidence
  relation acts_on C:
    kind intervention
`;
  const found = rules(await audit(text));
  for (const rule of ["REL001", "REL002", "REL003", "REL004"])
    assert.ok(found.includes(rule), rule);
  assert.ok(
    rules(await audit("framework F:\n  profile unknown-v99\n")).includes(
      "CI000",
    ),
  );
  for (const body of [
    "kind unknown",
    "kind causal\n    kind support",
    "kind causal\n    status assumed",
    "kind causal\n    evidence C,C",
    "kind causal\n    executable yes",
  ]) {
    assert.throws(() =>
      parseDocument(
        `decision D based_on C:\n  "text"\n  relation based_on C:\n    ${body}\n`,
      ),
    );
  }
});

test("unrelated unknown-cause notes cannot satisfy a phenomenon", async () => {
  const text =
    profile +
    `pending U:
  "unknown elsewhere"
  annotation role:
    "cause_unknown"
decision S based_on E:
  "observed"
  annotation role:
    "phenomenon"
evidence E:
  "observed"
`;
  assert.ok(rules(await audit(text)).includes("CI004"));
  assert.ok(
    !rules(
      await audit(text.replace("S based_on E:", "S based_on E,U:")),
    ).includes("CI004"),
  );
});

test("refuted causal paths do not supply causes; feedback traversal terminates", async () => {
  const text =
    profile +
    `premise C:
  "candidate"
  annotation role:
    "cause"
decision S based_on C,I:
  "phenomenon"
  annotation role:
    "phenomenon"
  relation based_on C:
    kind causal
    status hypothesis
  relation based_on I:
    kind causal
decision I based_on S:
  "impact"
  annotation role:
    "impact"
  relation based_on S:
    kind causal
`;
  assert.ok(!rules(await audit(text)).includes("CI004"));
  assert.ok(
    rules(
      await audit(text.replace("status hypothesis", "status refuted")),
    ).includes("CI004"),
  );
});

test("confirmed claims require edge evidence only in the selected profile", async () => {
  const text =
    'evidence E:\n  "evidence"\ndecision S based_on E:\n  "claim"\n  relation based_on E:\n    kind causal\n    status confirmed\n';
  assert.ok(!rules(await audit(text)).includes("CI002"));
  assert.ok(rules(await audit(profile + text)).includes("CI002"));
  assert.ok(
    !rules(await audit(profile + text + "    evidence E\n")).includes("CI002"),
  );
});

test("source spans distinguish same ID in support and action families", () => {
  const text =
    'premise acts_on:\n  "name"\ndecision M based_on acts_on acts_on acts_on:\n  "text"\n  relation acts_on acts_on:\n    kind intervention\n';
  const node = parseDocument(text).steps[1]!.statement;
  assert.equal(node.role, "decision");
  if (node.role !== "decision") return;
  const header = text.split("\n")[2]!;
  assert.equal(
    header.slice(
      node.actsOnSpans![0]!.column - 1,
      node.actsOnSpans![0]!.column - 1 + 7,
    ),
    "acts_on",
  );
  assert.equal(node.actsOnSpans![0]!.column, header.lastIndexOf("acts_on") + 1);
});

test("contextual clause words remain valid legacy identifiers around commas", () => {
  for (const refs of [
    "C, acts_on , D",
    "acts_on, D",
    "C, relation , D",
    "C,,D",
  ]) {
    const ast = parseDocument(`decision M based_on ${refs}:\n  "legacy"\n`);
    const node = ast.steps[0]!.statement;
    assert.equal(node.role, "decision");
    if (node.role === "decision") {
      assert.equal(node.actsOn, undefined);
      assert.deepEqual(
        node.basedOn,
        refs
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      );
    }
  }
});

test("selected profile cannot silently pass an unclassified legacy document", async () => {
  assert.ok(
    rules(await audit(profile + 'problem P:\n  "case"\n')).includes("CI012"),
  );
});

test("containment leaves separate cause and impact dispositions visibly open", async () => {
  const text = source
    .replace(/\n {2}annotation todo:\n {4}"U1[^\n]+"/, "")
    .replace(/\n {2}annotation todo:\n {4}"DB担当[^\n]+"/, "");
  const report = await audit(text);
  assert.ok(rules(report).includes("CI008"));
  assert.ok(rules(report).includes("CI009"));
  assert.ok(rules(report).includes("CI011"));
});

test("quoted mechanisms preserve escaped values through repeated formatting", () => {
  const mechanisms = [
    'close "pool" at C:\\app-data',
    "first\nsecond\tcolumn",
    "\nleading",
    "trailing\n",
    "\n",
    " \n  \n",
    "literal \\n is not a newline",
    "",
  ];
  for (const mechanism of mechanisms) {
    const text = `premise C:
  "condition"
decision M based_on C acts_on C:
  "action"
  relation acts_on C:
    kind intervention
    mechanism ${JSON.stringify(mechanism)}
`;
    const formatted = formatDocument(parseDocument(text));
    const restored = parseDocument(formatted).steps[1]!.statement;
    assert.equal(restored.role, "decision");
    if (restored.role !== "decision") continue;
    assert.equal(restored.relations![0]!.mechanism, mechanism);
    assert.equal(formatDocument(parseDocument(formatted)), formatted);
  }
  for (const invalid of [String.raw`"bad\q"`, '"unescaped "quote""']) {
    assert.throws(() =>
      parseDocument(`decision M based_on C acts_on C:
  "action"
  relation acts_on C:
    kind intervention
    mechanism ${invalid}
`),
    );
  }
});

test("shared causal branches retain per-node findings after graph propagation", async () => {
  const text =
    profile +
    `premise C:
  "cause"
  annotation role:
    "cause"
decision S1 based_on C:
  "first"
  annotation role:
    "phenomenon"
  relation based_on C:
    kind causal
decision S2 based_on C:
  "second"
  annotation role:
    "phenomenon"
  relation based_on C:
    kind causal
decision I based_on S1,S2:
  "impact"
  annotation role:
    "impact"
  relation based_on S1:
    kind causal
  relation based_on S2:
    kind causal
    status refuted
`;
  const findings = (await audit(text)).results.filter(
    (r) => r.metadata?.rule_id === "CI007",
  );
  assert.deepEqual(
    findings.map((r) => r.target_refs[0]!.ref_id),
    ["S2"],
  );
  assert.ok(!rules(await audit(text)).includes("CI004"));
});

test("many phenomena sharing a cause chain preserve cause and impact coverage", async () => {
  const count = 320;
  const parts = [profile, 'premise B:\n  "basis"'];
  for (let i = 0; i < count; i++) {
    const basis = i ? `C${i - 1}` : "B";
    parts.push(`decision C${i} based_on ${basis}:
  "cause"
  annotation role:
    "cause"
  relation based_on ${basis}:
    kind causal`);
  }
  for (let i = 0; i < count; i++)
    parts.push(`decision S${i} based_on C${count - 1}:
  "phenomenon"
  annotation role:
    "phenomenon"
  relation based_on C${count - 1}:
    kind causal`);
  parts.push(`decision I based_on S0:
  "impact"
  annotation role:
    "impact"
  relation based_on S0:
    kind causal`);
  const report = await audit(parts.join("\n"));
  assert.ok(!rules(report).includes("CI004"));
  const unassessed = report.results.filter(
    (r) => r.metadata?.rule_id === "CI007",
  );
  assert.equal(unassessed.length, count - 1);
  assert.ok(unassessed.every((r) => r.target_refs[0]!.ref_id.startsWith("S")));
});
