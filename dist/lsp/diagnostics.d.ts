import { DiagnosticSeverity } from "vscode-languageserver/node.js";
import { type AuditCategory, type AuditIssue, type AuditSeverity } from "@llmthink/core";
declare const CONFIGURABLE_HINT_CATEGORIES: readonly ["semantic_hint", "contradiction_candidate"];
export type ConfigurableHintCategory = (typeof CONFIGURABLE_HINT_CATEGORIES)[number];
export type DiagnosticSeverityOverride = "error" | "warning" | "info" | "hint" | "off";
export interface LspDiagnosticSettings {
    minimumSeverity: AuditSeverity;
    suppressedCategories: readonly AuditCategory[];
    categorySeverityOverrides: Readonly<Partial<Record<ConfigurableHintCategory, DiagnosticSeverityOverride>>>;
}
export declare const DEFAULT_LSP_DIAGNOSTIC_SETTINGS: LspDiagnosticSettings;
export declare function normalizeLspDiagnosticSettings(value: unknown): LspDiagnosticSettings;
export declare function resolveLspDiagnosticSeverity(issue: AuditIssue, settings: LspDiagnosticSettings): DiagnosticSeverity | undefined;
export {};
