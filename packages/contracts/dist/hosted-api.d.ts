import type { AuditReport } from "@llmthink/core";
export type ThoughtStatus = "draft" | "finalized";
export type ThoughtReflectionKind = "note" | "concern" | "decision" | "follow_up" | "audit_response";
export type ThoughtEventKind = "draft_saved" | "audit_recorded" | "semantic_audit_saved" | "finalized" | "related_created" | "reflect_recorded";
export interface ThoughtReflection {
    readonly id: string;
    readonly at: string;
    readonly kind: ThoughtReflectionKind;
    readonly text: string;
}
export interface ThoughtRecord {
    readonly id: string;
    readonly created_at: string;
    readonly updated_at: string;
    readonly status: ThoughtStatus;
    readonly derived_from?: string;
    readonly current_draft_path?: string;
    readonly final_path?: string;
    readonly latest_audit_path?: string;
}
export interface ThoughtEvent {
    readonly at: string;
    readonly kind: ThoughtEventKind;
    readonly summary: string;
    readonly path?: string;
}
export interface ThoughtSnapshot {
    readonly record: ThoughtRecord;
    readonly draftText?: string;
    readonly finalText?: string;
    readonly semanticAuditText?: string;
    readonly latestAudit?: AuditReport;
    readonly history: readonly ThoughtEvent[];
    readonly reflections: readonly ThoughtReflection[];
}
export declare const LLMTHINK_SERVER_API_VERSION: "v1";
export declare const LLMTHINK_SERVER_SCOPES: readonly ["thought:read", "thought:write", "thought:finalize", "audit:run"];
export type LlmthinkServerScope = (typeof LLMTHINK_SERVER_SCOPES)[number];
export interface ThoughtRef {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly thoughtId: string;
}
export interface CommandIdentity {
    readonly idempotencyKey: string;
    readonly requestDigest: `sha256:${string}`;
}
export interface RevisionPrecondition {
    readonly expectedRevision: number;
}
export interface ServerThoughtSnapshot extends ThoughtSnapshot {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly revision: number;
}
export interface AuditTextCommand {
    readonly text: string;
    readonly documentId?: string;
}
export interface PureAuditResult {
    readonly persisted: false;
    readonly report: AuditReport;
}
export interface CreateThoughtCommand {
    readonly thoughtId: string;
    readonly draftText: string;
    readonly identity: CommandIdentity;
}
export interface SaveDraftCommand extends RevisionPrecondition {
    readonly ref: ThoughtRef;
    readonly draftText: string;
    readonly identity: CommandIdentity;
}
export interface RecordAuditCommand extends RevisionPrecondition {
    readonly ref: ThoughtRef;
    readonly report: AuditReport;
    readonly identity: CommandIdentity;
}
export interface FinalizeThoughtCommand extends RevisionPrecondition {
    readonly ref: ThoughtRef;
    readonly finalText: string;
    readonly confirmationToken: string;
    readonly identity: CommandIdentity;
}
export interface AddReflectionCommand extends RevisionPrecondition {
    readonly ref: ThoughtRef;
    readonly kind: ThoughtReflectionKind;
    readonly text: string;
    readonly identity: CommandIdentity;
}
export interface DeleteThoughtCommand extends RevisionPrecondition {
    readonly ref: ThoughtRef;
    readonly identity: CommandIdentity;
}
export interface ThoughtDeletionReceipt {
    readonly thoughtId: string;
    readonly deleted: true;
    readonly deletedRevision: number;
}
export interface ThoughtListQuery {
    readonly cursor?: string;
    readonly limit: number;
    readonly status?: ThoughtStatus;
}
export interface ThoughtSearchQuery {
    readonly query: string;
    readonly cursor?: string;
    readonly limit: number;
    readonly includeReflections: boolean;
}
export interface ThoughtPage {
    readonly items: readonly ServerThoughtSnapshot[];
    readonly nextCursor?: string;
}
export declare const LLMTHINK_SERVER_ERROR_CODES: readonly ["invalid_argument", "unauthenticated", "forbidden", "not_found", "revision_conflict", "idempotency_conflict", "confirmation_required", "payload_too_large", "rate_limited", "storage_corrupt", "unsupported_schema_version", "internal"];
export type LlmthinkServerErrorCode = (typeof LLMTHINK_SERVER_ERROR_CODES)[number];
