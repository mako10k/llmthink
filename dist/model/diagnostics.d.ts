import type { DslqlValue } from "../dslql/evaluator.js";
export declare const AUDIT_RESULT_CATEGORIES: readonly ["contradiction", "contradiction_candidate", "contract_violation", "mece_assessment", "semantic_hint", "query_result"];
export type AuditResultCategory = (typeof AUDIT_RESULT_CATEGORIES)[number];
export type AuditCategory = AuditResultCategory | "output_limit";
export declare const AUDIT_SEVERITIES: readonly ["fatal", "error", "warning", "info", "hint"];
export type AuditSeverity = (typeof AUDIT_SEVERITIES)[number];
export interface AuditReference {
    ref_id: string;
    role?: string;
    step_id?: string;
}
export interface AuditIssue {
    issue_id: string;
    category: AuditCategory;
    severity: AuditSeverity;
    target_refs: AuditReference[];
    message: string;
    rationale?: string;
    suggestion?: string;
    metadata?: Record<string, unknown>;
}
export interface QueryResult {
    query_id: string;
    severity: "hint";
    values: DslqlValue[];
    total_value_count: number;
    truncated: boolean;
}
export interface AuditSummary {
    fatal_count: number;
    error_count: number;
    warning_count: number;
    info_count: number;
    hint_count: number;
}
export interface AuditReport {
    engine_version: string;
    document_id: string;
    generated_at: string;
    summary: AuditSummary;
    results: AuditIssue[];
    query_results: QueryResult[];
}
