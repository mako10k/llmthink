import type { AddReflectionCommand, CommandIdentity, CreateThoughtCommand, DeleteThoughtCommand, FinalizeThoughtCommand, LlmthinkServerErrorCode, LlmthinkServerScope, RecordAuditCommand, SaveDraftCommand, ServerThoughtSnapshot, ThoughtDeletionReceipt, ThoughtEvent, ThoughtListQuery, ThoughtPage, ThoughtRef, ThoughtReflection, ThoughtSearchQuery, ThoughtStatus } from "@llmthink/contracts";
import type { AuditReport } from "@llmthink/core";
export { LLMTHINK_SERVER_API_VERSION, LLMTHINK_SERVER_ERROR_CODES, LLMTHINK_SERVER_SCOPES, } from "@llmthink/contracts";
export type { AddReflectionCommand, AuditTextCommand, CommandIdentity, CreateThoughtCommand, DeleteThoughtCommand, FinalizeThoughtCommand, LlmthinkServerErrorCode, LlmthinkServerScope, PureAuditResult, RecordAuditCommand, RevisionPrecondition, SaveDraftCommand, ServerThoughtSnapshot, ThoughtDeletionReceipt, ThoughtEvent, ThoughtEventKind, ThoughtListQuery, ThoughtPage, ThoughtRecord, ThoughtRef, ThoughtReflection, ThoughtReflectionKind, ThoughtSearchQuery, ThoughtSnapshot, ThoughtStatus, } from "@llmthink/contracts";
export declare const LLMTHINK_SERVER_FILE_SCHEMA_VERSION: 1;
export declare const DEFAULT_IDEMPOTENCY_RETENTION_SECONDS: number;
export declare const MIN_IDEMPOTENCY_RETENTION_SECONDS: number;
export declare const MAX_IDEMPOTENCY_RETENTION_SECONDS: number;
export interface RequestContext {
    readonly subjectId: string;
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly scopes: readonly LlmthinkServerScope[];
    readonly requestId: string;
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
