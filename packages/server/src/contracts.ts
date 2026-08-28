import type {
  AddReflectionCommand,
  CommandIdentity,
  CreateThoughtCommand,
  DeleteThoughtCommand,
  FinalizeThoughtCommand,
  LlmthinkServerErrorCode,
  LlmthinkServerScope,
  RecordAuditCommand,
  SaveDraftCommand,
  ServerThoughtSnapshot,
  ThoughtDeletionReceipt,
  ThoughtEvent,
  ThoughtListQuery,
  ThoughtPage,
  ThoughtRef,
  ThoughtReflection,
  ThoughtSearchQuery,
  ThoughtStatus,
} from "@llmthink/contracts";
import type { AuditReport } from "@llmthink/core";

export {
  LLMTHINK_SERVER_API_VERSION,
  LLMTHINK_SERVER_ERROR_CODES,
  LLMTHINK_SERVER_SCOPES,
} from "@llmthink/contracts";
export type {
  AddReflectionCommand,
  AuditTextCommand,
  CommandIdentity,
  CreateThoughtCommand,
  DeleteThoughtCommand,
  FinalizeThoughtCommand,
  LlmthinkServerErrorCode,
  LlmthinkServerScope,
  PureAuditResult,
  RecordAuditCommand,
  RevisionPrecondition,
  SaveDraftCommand,
  ServerThoughtSnapshot,
  ThoughtDeletionReceipt,
  ThoughtEvent,
  ThoughtEventKind,
  ThoughtListQuery,
  ThoughtPage,
  ThoughtRecord,
  ThoughtRef,
  ThoughtReflection,
  ThoughtReflectionKind,
  ThoughtSearchQuery,
  ThoughtSnapshot,
  ThoughtStatus,
} from "@llmthink/contracts";

export const LLMTHINK_SERVER_FILE_SCHEMA_VERSION = 1 as const;
export const DEFAULT_IDEMPOTENCY_RETENTION_SECONDS = 24 * 60 * 60;
export const MIN_IDEMPOTENCY_RETENTION_SECONDS = 60 * 60;
export const MAX_IDEMPOTENCY_RETENTION_SECONDS = 7 * 24 * 60 * 60;

export interface RequestContext {
  readonly subjectId: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly scopes: readonly LlmthinkServerScope[];
  readonly requestId: string;
}

export interface ThoughtRepository {
  create(
    command: CreateThoughtCommand,
    context: RequestContext,
  ): Promise<ServerThoughtSnapshot>;
  get(
    ref: ThoughtRef,
    context: RequestContext,
  ): Promise<ServerThoughtSnapshot | null>;
  list(query: ThoughtListQuery, context: RequestContext): Promise<ThoughtPage>;
  search(
    query: ThoughtSearchQuery,
    context: RequestContext,
  ): Promise<ThoughtPage>;
  saveDraft(
    command: SaveDraftCommand,
    context: RequestContext,
  ): Promise<ServerThoughtSnapshot>;
  recordAudit(
    command: RecordAuditCommand,
    context: RequestContext,
  ): Promise<ServerThoughtSnapshot>;
  finalize(
    command: FinalizeThoughtCommand,
    context: RequestContext,
  ): Promise<ServerThoughtSnapshot>;
  addReflection(
    command: AddReflectionCommand,
    context: RequestContext,
  ): Promise<ServerThoughtSnapshot>;
  delete(
    command: DeleteThoughtCommand,
    context: RequestContext,
  ): Promise<ThoughtDeletionReceipt>;
  events(
    ref: ThoughtRef,
    context: RequestContext,
  ): Promise<readonly ThoughtEvent[]>;
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

const RETRYABLE_ERROR_CODES = new Set<LlmthinkServerErrorCode>([
  "rate_limited",
  "internal",
]);

export class LlmthinkServerError extends Error {
  readonly code: LlmthinkServerErrorCode;
  readonly retryable: boolean;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    code: LlmthinkServerErrorCode,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "LlmthinkServerError";
    this.code = code;
    this.retryable = RETRYABLE_ERROR_CODES.has(code);
    this.details = details;
  }
}

const HOSTED_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7e]{1,200}$/;
const SHA256_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;

export function assertHostedId(kind: string, value: string): void {
  if (!HOSTED_ID_PATTERN.test(value)) {
    throw new LlmthinkServerError(
      "invalid_argument",
      `${kind} must contain 1-128 ASCII letters, digits, underscores, or hyphens`,
      { field: kind },
    );
  }
}

export function assertRevision(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new LlmthinkServerError(
      "invalid_argument",
      "expectedRevision must be a non-negative safe integer",
      { field: "expectedRevision" },
    );
  }
}

export function assertCommandIdentity(identity: CommandIdentity): void {
  if (!IDEMPOTENCY_KEY_PATTERN.test(identity.idempotencyKey)) {
    throw new LlmthinkServerError(
      "invalid_argument",
      "idempotencyKey must contain 1-200 visible ASCII characters",
      { field: "idempotencyKey" },
    );
  }
  if (!SHA256_DIGEST_PATTERN.test(identity.requestDigest)) {
    throw new LlmthinkServerError(
      "invalid_argument",
      "requestDigest must use sha256 with 64 lowercase hexadecimal digits",
      { field: "requestDigest" },
    );
  }
}

export function assertIdempotencyRetention(seconds: number): void {
  if (
    !Number.isSafeInteger(seconds) ||
    seconds < MIN_IDEMPOTENCY_RETENTION_SECONDS ||
    seconds > MAX_IDEMPOTENCY_RETENTION_SECONDS
  ) {
    throw new LlmthinkServerError(
      "invalid_argument",
      `idempotency retention must be ${MIN_IDEMPOTENCY_RETENTION_SECONDS}-${MAX_IDEMPOTENCY_RETENTION_SECONDS} seconds`,
      { field: "idempotencyRetentionSeconds" },
    );
  }
}

export function assertThoughtRef(
  ref: ThoughtRef,
  context: RequestContext,
): void {
  assertHostedId("tenantId", ref.tenantId);
  assertHostedId("workspaceId", ref.workspaceId);
  assertHostedId("thoughtId", ref.thoughtId);
  if (
    ref.tenantId !== context.tenantId ||
    ref.workspaceId !== context.workspaceId
  ) {
    throw new LlmthinkServerError("forbidden", "Thought scope mismatch");
  }
}
