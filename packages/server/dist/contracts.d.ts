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
export declare const LLMTHINK_SERVER_FILE_SCHEMA_VERSION: 1;
export declare const DEFAULT_IDEMPOTENCY_RETENTION_SECONDS: number;
export declare const MIN_IDEMPOTENCY_RETENTION_SECONDS: number;
export declare const MAX_IDEMPOTENCY_RETENTION_SECONDS: number;
export declare const LLMTHINK_SERVER_SCOPES: readonly ["thought:read", "thought:write", "thought:finalize", "audit:run"];
export type LlmthinkServerScope = (typeof LLMTHINK_SERVER_SCOPES)[number];
export interface RequestContext {
    readonly subjectId: string;
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly scopes: readonly LlmthinkServerScope[];
    readonly requestId: string;
}
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
export interface ThoughtRepository {
    create(command: CreateThoughtCommand, context: RequestContext): Promise<ServerThoughtSnapshot>;
    get(ref: ThoughtRef, context: RequestContext): Promise<ServerThoughtSnapshot | null>;
    list(query: ThoughtListQuery, context: RequestContext): Promise<ThoughtPage>;
    search(query: ThoughtSearchQuery, context: RequestContext): Promise<ThoughtPage>;
    saveDraft(command: SaveDraftCommand, context: RequestContext): Promise<ServerThoughtSnapshot>;
    recordAudit(command: RecordAuditCommand, context: RequestContext): Promise<ServerThoughtSnapshot>;
    finalize(command: FinalizeThoughtCommand, context: RequestContext): Promise<ServerThoughtSnapshot>;
    addReflection(command: AddReflectionCommand, context: RequestContext): Promise<ServerThoughtSnapshot>;
    delete(command: DeleteThoughtCommand, context: RequestContext): Promise<ThoughtDeletionReceipt>;
    events(ref: ThoughtRef, context: RequestContext): Promise<readonly ThoughtEvent[]>;
}
export interface ServerThoughtFileRecord {
    readonly schema_version: typeof LLMTHINK_SERVER_FILE_SCHEMA_VERSION;
    readonly tenant_id: string;
    readonly workspace_id: string;
    readonly thought_id: string;
    readonly revision: number;
    readonly status: ThoughtStatus;
    readonly created_at: string;
    readonly updated_at: string;
    readonly has_draft: boolean;
    readonly has_final: boolean;
    readonly latest_audit_id?: string;
}
export interface ServerThoughtCurrentPointer {
    readonly schema_version: typeof LLMTHINK_SERVER_FILE_SCHEMA_VERSION;
    readonly revision: number;
}
export interface StoredIdempotencyRecord {
    readonly schema_version: typeof LLMTHINK_SERVER_FILE_SCHEMA_VERSION;
    readonly subject_id: string;
    readonly operation: string;
    readonly resource_id: string;
    readonly key_digest: `sha256:${string}`;
    readonly request_digest: `sha256:${string}`;
    readonly result_revision: number;
    readonly created_at: string;
    readonly expires_at: string;
}
export interface NewThoughtRevision {
    readonly record: ServerThoughtFileRecord;
    readonly draftText?: string;
    readonly finalText?: string;
    readonly semanticAuditText?: string;
    readonly audit?: AuditReport;
    readonly events: readonly ThoughtEvent[];
    readonly reflections: readonly ThoughtReflection[];
}
export declare const LLMTHINK_SERVER_ERROR_CODES: readonly ["invalid_argument", "unauthenticated", "forbidden", "not_found", "revision_conflict", "idempotency_conflict", "confirmation_required", "payload_too_large", "rate_limited", "storage_corrupt", "unsupported_schema_version", "internal"];
export type LlmthinkServerErrorCode = (typeof LLMTHINK_SERVER_ERROR_CODES)[number];
export declare class LlmthinkServerError extends Error {
    readonly code: LlmthinkServerErrorCode;
    readonly retryable: boolean;
    readonly details?: Readonly<Record<string, unknown>>;
    constructor(code: LlmthinkServerErrorCode, message: string, details?: Readonly<Record<string, unknown>>);
}
export declare function assertHostedId(kind: string, value: string): void;
export declare function assertRevision(value: number): void;
export declare function assertCommandIdentity(identity: CommandIdentity): void;
export declare function assertIdempotencyRetention(seconds: number): void;
export declare function assertThoughtRef(ref: ThoughtRef, context: RequestContext): void;
