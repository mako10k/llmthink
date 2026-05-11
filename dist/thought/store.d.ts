import type { AuditReport } from "../model/diagnostics.js";
import { type EmbeddingRequestOptions } from "../semantic/embeddings.js";
export type ThoughtStatus = "draft" | "finalized";
export type ThoughtReflectionKind = "note" | "concern" | "decision" | "follow_up" | "audit_response";
export type ThoughtSemanticAuditVerdict = "supported" | "unsupported" | "mixed" | "unknown";
export type ThoughtEventKind = "draft_saved" | "audit_recorded" | "semantic_audit_saved" | "finalized" | "related_created" | "reflect_recorded";
export interface ThoughtSemanticAuditInput {
    auditId?: string;
    decisionId: string;
    supportId: string;
    verdict: ThoughtSemanticAuditVerdict;
    reason: string;
    reviewer?: string;
    model?: string;
    auditedAt?: string;
    sourceThoughtId?: string;
}
export interface ThoughtReflection {
    id: string;
    at: string;
    kind: ThoughtReflectionKind;
    text: string;
}
export interface ThoughtRecord {
    id: string;
    created_at: string;
    updated_at: string;
    status: ThoughtStatus;
    derived_from?: string;
    current_draft_path?: string;
    final_path?: string;
    latest_audit_path?: string;
}
export interface ThoughtEvent {
    at: string;
    kind: ThoughtEventKind;
    summary: string;
    path?: string;
}
export interface ThoughtSnapshot {
    record: ThoughtRecord;
    draftText?: string;
    finalText?: string;
    semanticAuditText?: string;
    latestAudit?: AuditReport;
    history: ThoughtEvent[];
    reflections: ThoughtReflection[];
}
export interface ThoughtSearchResult {
    id: string;
    status: ThoughtStatus;
    score: number;
    source: ThoughtSearchSource;
    excerpt: string;
    explanation?: string;
}
export type ThoughtSearchSource = "draft" | "final" | "reflection" | "draft+final" | "draft+reflection" | "final+reflection" | "draft+final+reflection";
export interface ThoughtSearchOptions extends EmbeddingRequestOptions {
    includeReflections?: boolean;
}
export declare function ensureThoughtRecord(id: string, baseDir?: string): ThoughtRecord;
export declare function draftThought(id: string, text: string, baseDir?: string): ThoughtRecord;
export declare function relateThought(id: string, fromThoughtId: string, baseDir?: string): ThoughtRecord;
export declare function finalizeThought(id: string, text: string, baseDir?: string): ThoughtRecord;
export declare function addThoughtReflection(id: string, text: string, kind?: ThoughtReflectionKind, baseDir?: string): ThoughtRecord;
export declare function recordThoughtAudit(id: string, report: AuditReport, baseDir?: string): ThoughtRecord;
export declare function saveThoughtSemanticAudit(id: string, input: ThoughtSemanticAuditInput, baseDir?: string): ThoughtRecord;
export declare function loadThought(id: string, baseDir?: string): ThoughtSnapshot;
export declare function deleteThought(id: string, baseDir?: string): boolean;
export declare function listThoughts(baseDir?: string): ThoughtRecord[];
export declare function searchThoughtRecords(query: string, baseDir?: string, options?: ThoughtSearchOptions): Promise<ThoughtSearchResult[]>;
