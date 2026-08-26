import assert from "node:assert/strict";
import test from "node:test";
import { DiagnosticSeverity } from "vscode-languageserver/node.js";
import {
  DEFAULT_LSP_DIAGNOSTIC_SETTINGS,
  normalizeLspDiagnosticSettings,
  resolveLspDiagnosticSeverity,
} from "../../src/lsp/diagnostics.js";
import type {
  AuditCategory,
  AuditIssue,
  AuditSeverity,
} from "../../src/model/diagnostics.js";

function issue(category: AuditCategory, severity: AuditSeverity): AuditIssue {
  return {
    issue_id: `ISSUE-${category}-${severity}`,
    category,
    severity,
    target_refs: [],
    message: "diagnostic",
  };
}

test("default LSP diagnostic settings preserve every audit severity", () => {
  assert.equal(
    resolveLspDiagnosticSeverity(
      issue("contract_violation", "fatal"),
      DEFAULT_LSP_DIAGNOSTIC_SETTINGS,
    ),
    DiagnosticSeverity.Error,
  );
  assert.equal(
    resolveLspDiagnosticSeverity(
      issue("contradiction_candidate", "warning"),
      DEFAULT_LSP_DIAGNOSTIC_SETTINGS,
    ),
    DiagnosticSeverity.Warning,
  );
  assert.equal(
    resolveLspDiagnosticSeverity(
      issue("semantic_hint", "info"),
      DEFAULT_LSP_DIAGNOSTIC_SETTINGS,
    ),
    DiagnosticSeverity.Information,
  );
  assert.equal(
    resolveLspDiagnosticSeverity(
      issue("semantic_hint", "hint"),
      DEFAULT_LSP_DIAGNOSTIC_SETTINGS,
    ),
    DiagnosticSeverity.Hint,
  );
});

test("minimum severity filters diagnostics after a hint-category downgrade", () => {
  const settings = normalizeLspDiagnosticSettings({
    minimumSeverity: "info",
    categorySeverityOverrides: {
      contradiction_candidate: "hint",
    },
  });

  assert.equal(
    resolveLspDiagnosticSeverity(
      issue("contradiction_candidate", "warning"),
      settings,
    ),
    undefined,
  );
  assert.equal(
    resolveLspDiagnosticSeverity(
      issue("contract_violation", "error"),
      settings,
    ),
    DiagnosticSeverity.Error,
  );
});

test("category suppression and off override hide only selected diagnostics", () => {
  const settings = normalizeLspDiagnosticSettings({
    suppressedCategories: ["semantic_hint"],
    categorySeverityOverrides: {
      contradiction_candidate: "off",
    },
  });

  assert.equal(
    resolveLspDiagnosticSeverity(issue("semantic_hint", "warning"), settings),
    undefined,
  );
  assert.equal(
    resolveLspDiagnosticSeverity(
      issue("contradiction_candidate", "warning"),
      settings,
    ),
    undefined,
  );
  assert.equal(
    resolveLspDiagnosticSeverity(issue("contradiction", "error"), settings),
    DiagnosticSeverity.Error,
  );
});

test("normalization ignores invalid values and strong-category overrides", () => {
  const settings = normalizeLspDiagnosticSettings({
    minimumSeverity: "verbose",
    suppressedCategories: ["semantic_hint", "semantic_hint", "not-a-category"],
    categorySeverityOverrides: {
      semantic_hint: "info",
      contradiction_candidate: "loud",
      contract_violation: "off",
    },
  });

  assert.deepEqual(settings, {
    minimumSeverity: "hint",
    suppressedCategories: ["semantic_hint"],
    categorySeverityOverrides: { semantic_hint: "info" },
  });
  assert.equal(
    resolveLspDiagnosticSeverity(
      issue("contract_violation", "error"),
      settings,
    ),
    DiagnosticSeverity.Error,
  );
});
