export type AuditCategory = "contradiction" | "contradiction_candidate" | "contract_violation" | "mece_assessment" | "semantic_hint" | "output_limit" | "query_result";
export type AuditSeverity = "fatal" | "error" | "warning" | "info" | "hint";
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
export interface QueryResultItem {
    ref_id: string;
    score?: number;
    explanation?: string;
}
export interface QueryResult {
    query_id: string;
    severity: "hint";
    items: QueryResultItem[];
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
