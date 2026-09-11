import { type AuditReport, type AuditSeverity } from "@llmthink/core";
export interface DslCheckDocument {
    source_sha256: string;
    sources: string[];
    report: AuditReport;
}
export interface DslCheckResult {
    persisted: false;
    fail_on: AuditSeverity;
    failed: boolean;
    source_count: number;
    unique_content_count: number;
    summary: AuditReport["summary"];
    documents: DslCheckDocument[];
}
export declare function checkDslSources(options: {
    inputs: string[];
    text?: string;
    documentId?: string;
    failOn?: AuditSeverity;
    cwd?: string;
    stdinText?: string;
}): Promise<DslCheckResult>;
