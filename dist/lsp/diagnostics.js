import { DiagnosticSeverity } from "vscode-languageserver/node.js";
import { AUDIT_RESULT_CATEGORIES, AUDIT_SEVERITIES, } from "@llmthink/core";
const CONFIGURABLE_HINT_CATEGORIES = [
    "semantic_hint",
    "contradiction_candidate",
];
export const DEFAULT_LSP_DIAGNOSTIC_SETTINGS = {
    minimumSeverity: "hint",
    suppressedCategories: [],
    categorySeverityOverrides: {},
};
const ALL_AUDIT_CATEGORIES = [
    ...AUDIT_RESULT_CATEGORIES,
    "output_limit",
];
const SEVERITY_PRIORITY = {
    fatal: 0,
    error: 1,
    warning: 2,
    info: 3,
    hint: 4,
};
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isAuditSeverity(value) {
    return (typeof value === "string" &&
        AUDIT_SEVERITIES.includes(value));
}
function isAuditCategory(value) {
    return (typeof value === "string" &&
        ALL_AUDIT_CATEGORIES.includes(value));
}
function isDiagnosticSeverityOverride(value) {
    return (typeof value === "string" &&
        ["error", "warning", "info", "hint", "off"].includes(value));
}
function normalizeOverrides(value) {
    if (!isRecord(value)) {
        return {};
    }
    const overrides = {};
    for (const category of CONFIGURABLE_HINT_CATEGORIES) {
        const override = value[category];
        if (isDiagnosticSeverityOverride(override)) {
            overrides[category] = override;
        }
    }
    return overrides;
}
export function normalizeLspDiagnosticSettings(value) {
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
        categorySeverityOverrides: normalizeOverrides(value.categorySeverityOverrides),
    };
}
function configurableHintCategory(category) {
    return CONFIGURABLE_HINT_CATEGORIES.includes(category)
        ? category
        : undefined;
}
function severityToDiagnostic(severity) {
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
export function resolveLspDiagnosticSeverity(issue, settings) {
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
    if (SEVERITY_PRIORITY[effectiveSeverity] >
        SEVERITY_PRIORITY[settings.minimumSeverity]) {
        return undefined;
    }
    return severityToDiagnostic(effectiveSeverity);
}
//# sourceMappingURL=diagnostics.js.map