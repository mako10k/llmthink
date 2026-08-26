import { DiagnosticSeverity } from "vscode-languageserver/node.js";
import {
  AUDIT_RESULT_CATEGORIES,
  AUDIT_SEVERITIES,
} from "../model/diagnostics.js";
import type {
  AuditCategory,
  AuditIssue,
  AuditSeverity,
} from "../model/diagnostics.js";

const CONFIGURABLE_HINT_CATEGORIES = [
  "semantic_hint",
  "contradiction_candidate",
] as const;

export type ConfigurableHintCategory =
  (typeof CONFIGURABLE_HINT_CATEGORIES)[number];
export type DiagnosticSeverityOverride =
  | "error"
  | "warning"
  | "info"
  | "hint"
  | "off";

export interface LspDiagnosticSettings {
  minimumSeverity: AuditSeverity;
  suppressedCategories: readonly AuditCategory[];
  categorySeverityOverrides: Readonly<
    Partial<Record<ConfigurableHintCategory, DiagnosticSeverityOverride>>
  >;
}

export const DEFAULT_LSP_DIAGNOSTIC_SETTINGS: LspDiagnosticSettings = {
  minimumSeverity: "hint",
  suppressedCategories: [],
  categorySeverityOverrides: {},
};

const ALL_AUDIT_CATEGORIES = [
  ...AUDIT_RESULT_CATEGORIES,
  "output_limit",
] as const satisfies readonly AuditCategory[];

const SEVERITY_PRIORITY: Record<AuditSeverity, number> = {
  fatal: 0,
  error: 1,
  warning: 2,
  info: 3,
  hint: 4,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAuditSeverity(value: unknown): value is AuditSeverity {
  return (
    typeof value === "string" &&
    (AUDIT_SEVERITIES as readonly string[]).includes(value)
  );
}

function isAuditCategory(value: unknown): value is AuditCategory {
  return (
    typeof value === "string" &&
    (ALL_AUDIT_CATEGORIES as readonly string[]).includes(value)
  );
}

function isDiagnosticSeverityOverride(
  value: unknown,
): value is DiagnosticSeverityOverride {
  return (
    typeof value === "string" &&
    ["error", "warning", "info", "hint", "off"].includes(value)
  );
}

function normalizeOverrides(
  value: unknown,
): LspDiagnosticSettings["categorySeverityOverrides"] {
  if (!isRecord(value)) {
    return {};
  }

  const overrides: Partial<
    Record<ConfigurableHintCategory, DiagnosticSeverityOverride>
  > = {};
  for (const category of CONFIGURABLE_HINT_CATEGORIES) {
    const override = value[category];
    if (isDiagnosticSeverityOverride(override)) {
      overrides[category] = override;
    }
  }
  return overrides;
}

export function normalizeLspDiagnosticSettings(
  value: unknown,
): LspDiagnosticSettings {
  if (!isRecord(value)) {
    return DEFAULT_LSP_DIAGNOSTIC_SETTINGS;
  }

  const minimumSeverity = isAuditSeverity(value.minimumSeverity)
    ? value.minimumSeverity
    : DEFAULT_LSP_DIAGNOSTIC_SETTINGS.minimumSeverity;
  const suppressedCategories = Array.isArray(value.suppressedCategories)
    ? [...new Set(value.suppressedCategories.filter(isAuditCategory))]
    : [];

  return {
    minimumSeverity,
    suppressedCategories,
    categorySeverityOverrides: normalizeOverrides(
      value.categorySeverityOverrides,
    ),
  };
}

function configurableHintCategory(
  category: AuditCategory,
): ConfigurableHintCategory | undefined {
  return (CONFIGURABLE_HINT_CATEGORIES as readonly AuditCategory[]).includes(
    category,
  )
    ? (category as ConfigurableHintCategory)
    : undefined;
}

function severityToDiagnostic(severity: AuditSeverity): DiagnosticSeverity {
  switch (severity) {
    case "fatal":
    case "error":
      return DiagnosticSeverity.Error;
    case "warning":
      return DiagnosticSeverity.Warning;
    case "info":
      return DiagnosticSeverity.Information;
    case "hint":
      return DiagnosticSeverity.Hint;
  }
}

export function resolveLspDiagnosticSeverity(
  issue: AuditIssue,
  settings: LspDiagnosticSettings,
): DiagnosticSeverity | undefined {
  if (settings.suppressedCategories.includes(issue.category)) {
    return undefined;
  }

  const configurableCategory = configurableHintCategory(issue.category);
  const override = configurableCategory
    ? settings.categorySeverityOverrides[configurableCategory]
    : undefined;
  if (override === "off") {
    return undefined;
  }

  const effectiveSeverity = override ?? issue.severity;
  if (
    SEVERITY_PRIORITY[effectiveSeverity] >
    SEVERITY_PRIORITY[settings.minimumSeverity]
  ) {
    return undefined;
  }
  return severityToDiagnostic(effectiveSeverity);
}
