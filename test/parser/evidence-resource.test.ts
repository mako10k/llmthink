import assert from "node:assert/strict";
import test from "node:test";

import {
  auditDslText,
  EvidenceResourceValidationError,
  formatDslText,
  ParseError,
  parseDocument,
  validateEvidenceResource,
} from "../../src/index.ts";

const SHA256_HEX =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function evidenceStatement(source: string) {
  const statement = parseDocument(source).steps[0]?.statement;
  assert.equal(statement?.role, "evidence");
  if (!statement || statement.role !== "evidence") {
    throw new Error("expected evidence statement");
  }
  return statement;
}

test("legacy evidence exposes an empty resources collection", () => {
  const evidence = evidenceStatement(`
evidence EV1:
  "Legacy evidence remains valid"
`);

  assert.deepEqual(evidence.resources, []);
});

test("parseDocument preserves ordered anonymous resources and field spans", () => {
  const evidence = evidenceStatement(`evidence EV1:
  "Two provenance resources"
  resource:
    label "Published specification"
    mime "application/pdf"
    digest "sha256:${SHA256_HEX}"
    url "https://example.test/spec.pdf"
  annotation rationale:
    "The evidence remains the based_on target"
  resource:
    file "docs/local-notes.md"
  resource:
    blob "sha256:${SHA256_HEX}"
    mime "application/octet-stream"
    label "Archived snapshot"
`);

  assert.equal(evidence.resources.length, 3);
  assert.deepEqual(evidence.resources[0], {
    locator: {
      kind: "url",
      value: "https://example.test/spec.pdf",
      span: { line: 7, column: 5 },
    },
    digest: {
      algorithm: "sha256",
      value: SHA256_HEX,
      span: { line: 6, column: 5 },
    },
    mime: {
      value: "application/pdf",
      span: { line: 5, column: 5 },
    },
    label: {
      value: "Published specification",
      span: { line: 4, column: 5 },
    },
    span: { line: 3, column: 3 },
  });
  assert.deepEqual(evidence.resources[1], {
    locator: {
      kind: "file",
      value: "docs/local-notes.md",
      span: { line: 11, column: 5 },
    },
    span: { line: 10, column: 3 },
  });
  assert.deepEqual(evidence.resources[2], {
    locator: {
      kind: "blob",
      value: `sha256:${SHA256_HEX}`,
      span: { line: 13, column: 5 },
    },
    mime: {
      value: "application/octet-stream",
      span: { line: 14, column: 5 },
    },
    label: {
      value: "Archived snapshot",
      span: { line: 15, column: 5 },
    },
    span: { line: 12, column: 3 },
  });
  assert.deepEqual(
    evidence.annotations.map((annotation) => annotation.kind),
    ["rationale"],
  );
});

test("formatDslText groups resources before annotations and canonicalizes field order", () => {
  const formatted = formatDslText(`
evidence EV1:
  "Two provenance resources"
  resource:
    label "Published specification"
    mime "application/pdf"
    digest "sha256:${SHA256_HEX}"
    url "https://example.test/spec.pdf"
  annotation rationale:
    "The evidence remains the based_on target"
  resource:
    file "docs/local-notes.md"
  resource:
    blob "sha256:${SHA256_HEX}"
    mime "application/octet-stream"
    label "Archived snapshot"
`);

  assert.equal(
    formatted,
    [
      "evidence EV1:",
      '  "Two provenance resources"',
      "  resource:",
      '    url "https://example.test/spec.pdf"',
      `    digest "sha256:${SHA256_HEX}"`,
      '    mime "application/pdf"',
      '    label "Published specification"',
      "  resource:",
      '    file "docs/local-notes.md"',
      "  resource:",
      `    blob "sha256:${SHA256_HEX}"`,
      '    mime "application/octet-stream"',
      '    label "Archived snapshot"',
      "  annotation rationale:",
      '    "The evidence remains the based_on target"',
      "",
    ].join("\n"),
  );
});

test("resource URL locators accept absolute HTTP and HTTPS URLs", () => {
  for (const url of [
    "http://example.test/evidence",
    "https://example.test/evidence",
  ]) {
    const evidence = evidenceStatement(`
evidence EV1:
  "Remote provenance"
  resource:
    url "${url}"
`);
    assert.equal(evidence.resources[0]?.locator.kind, "url");
    assert.equal(evidence.resources[0]?.locator.value, url);
  }
});

test("resource blocks work inside explicit steps", () => {
  const document = parseDocument(`
step S1:
  evidence EV1:
    "Nested provenance"
    resource:
      file "docs/spec.md"
`);
  const statement = document.steps[0]?.statement;
  assert.equal(statement?.role, "evidence");
  assert.equal(
    statement?.role === "evidence"
      ? statement.resources[0]?.locator.value
      : undefined,
    "docs/spec.md",
  );
});

test("resource blocks stay anonymous and cannot replace evidence text", () => {
  assert.throws(
    () =>
      parseDocument(`
evidence EV1:
  "Named resources are deferred"
  resource R1:
    file "docs/spec.md"
`),
    /Evidence resources must use anonymous 'resource:' syntax/,
  );

  assert.throws(
    () =>
      parseDocument(`
evidence EV1:
  resource:
    file "docs/spec.md"
`),
    /evidence text is required/,
  );
});

test("parseDocument rejects invalid resource structure at the AST boundary", () => {
  const invalidCases = [
    {
      name: "missing locator",
      body: '    label "missing locator"',
      message: "Evidence resource locator is required",
    },
    {
      name: "multiple locators",
      body: [
        '    url "https://example.test/spec"',
        '    file "docs/spec.md"',
      ].join("\n"),
      message: "Evidence resource must have exactly one locator",
    },
    {
      name: "duplicate field",
      body: [
        '    file "docs/spec.md"',
        '    label "first"',
        '    label "second"',
      ].join("\n"),
      message: "Duplicate evidence resource field 'label'",
    },
    {
      name: "unknown field",
      body: ['    file "docs/spec.md"', '    source "unsupported alias"'].join(
        "\n",
      ),
      message: "Unknown evidence resource field 'source'",
    },
    {
      name: "relative URL",
      body: '    url "spec.pdf"',
      message: "Evidence resource URL must be an absolute http or https URL",
    },
    {
      name: "unsupported URL scheme",
      body: '    url "ftp://example.test/spec.pdf"',
      message: "Unsupported evidence resource URL scheme 'ftp'",
    },
    {
      name: "empty file path",
      body: '    file ""',
      message: "Evidence resource file path must not be empty",
    },
    {
      name: "malformed digest",
      body: ['    file "docs/spec.md"', '    digest "sha256:abc"'].join("\n"),
      message: "Evidence resource digest must use sha256:<64 hex>",
    },
    {
      name: "MIME parameters",
      body: [
        '    file "docs/spec.md"',
        '    mime "text/plain; charset=utf-8"',
      ].join("\n"),
      message:
        "Evidence resource MIME type must be type/subtype without parameters",
    },
    {
      name: "empty label",
      body: ['    file "docs/spec.md"', '    label ""'].join("\n"),
      message: "Evidence resource label must not be empty",
    },
    {
      name: "blob plus digest",
      body: [
        `    blob "sha256:${SHA256_HEX}"`,
        `    digest "sha256:${SHA256_HEX}"`,
      ].join("\n"),
      message:
        "Evidence resource blob locator cannot be combined with digest metadata",
    },
  ] as const;

  for (const invalidCase of invalidCases) {
    assert.throws(
      () =>
        parseDocument(`
evidence EV1:
  "Invalid ${invalidCase.name}"
  resource:
${invalidCase.body}
`),
      (error: unknown) =>
        error instanceof ParseError &&
        error.message.startsWith(invalidCase.message),
      invalidCase.name,
    );
  }
});

test("auditDslText reports resource parse failures as targeted fatal diagnostics", async () => {
  const report = await auditDslText(`
evidence EV1:
  "Invalid resource"
  resource:
    label "missing locator"
`);

  assert.equal(report.summary.fatal_count, 1);
  assert.equal(report.results[0]?.category, "contract_violation");
  assert.equal(
    report.results[0]?.message,
    "Evidence resource locator is required at line 4",
  );
  assert.deepEqual(
    {
      line: report.results[0]?.metadata?.line,
      column: report.results[0]?.metadata?.column,
    },
    { line: 4, column: 3 },
  );
});

test("validateEvidenceResource rejects malformed hand-built AST values", () => {
  assert.throws(
    () =>
      validateEvidenceResource({
        locator: {
          kind: "url",
          value: "relative/path",
          span: { line: 4, column: 5 },
        },
        span: { line: 3, column: 3 },
      }),
    EvidenceResourceValidationError,
  );

  assert.throws(
    () =>
      validateEvidenceResource({
        locator: {
          kind: "blob",
          value: `sha256:${SHA256_HEX}`,
          span: { line: 4, column: 5 },
        },
        digest: {
          algorithm: "sha256",
          value: SHA256_HEX,
          span: { line: 5, column: 5 },
        },
        span: { line: 3, column: 3 },
      }),
    /blob locator cannot be combined/,
  );
});

test("default text audit performs no resource resolution", async () => {
  const report = await auditDslText(`
evidence EV1:
  "Resource resolution remains opt-in"
  resource:
    url "https://unreachable.invalid/evidence"
  resource:
    file "missing/outside-runtime.txt"
`);

  assert.equal(report.summary.fatal_count, 0);
  assert.equal(report.summary.error_count, 0);
  assert.equal(
    report.results.some((issue) =>
      /unreachable|missing|file existence|URL reachability/.test(issue.message),
    ),
    false,
  );
});
