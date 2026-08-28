export const LLMTHINK_SERVER_API_VERSION = "v1";
export const LLMTHINK_SERVER_FILE_SCHEMA_VERSION = 1;
export const DEFAULT_IDEMPOTENCY_RETENTION_SECONDS = 24 * 60 * 60;
export const MIN_IDEMPOTENCY_RETENTION_SECONDS = 60 * 60;
export const MAX_IDEMPOTENCY_RETENTION_SECONDS = 7 * 24 * 60 * 60;
export const LLMTHINK_SERVER_SCOPES = [
    "thought:read",
    "thought:write",
    "thought:finalize",
    "audit:run",
];
export const LLMTHINK_SERVER_ERROR_CODES = [
    "invalid_argument",
    "unauthenticated",
    "forbidden",
    "not_found",
    "revision_conflict",
    "idempotency_conflict",
    "confirmation_required",
    "payload_too_large",
    "rate_limited",
    "storage_corrupt",
    "unsupported_schema_version",
    "internal",
];
const RETRYABLE_ERROR_CODES = new Set([
    "rate_limited",
    "internal",
]);
export class LlmthinkServerError extends Error {
    code;
    retryable;
    details;
    constructor(code, message, details) {
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
export function assertHostedId(kind, value) {
    if (!HOSTED_ID_PATTERN.test(value)) {
        throw new LlmthinkServerError("invalid_argument", `${kind} must contain 1-128 ASCII letters, digits, underscores, or hyphens`, { field: kind });
    }
}
export function assertRevision(value) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new LlmthinkServerError("invalid_argument", "expectedRevision must be a non-negative safe integer", { field: "expectedRevision" });
    }
}
export function assertCommandIdentity(identity) {
    if (!IDEMPOTENCY_KEY_PATTERN.test(identity.idempotencyKey)) {
        throw new LlmthinkServerError("invalid_argument", "idempotencyKey must contain 1-200 visible ASCII characters", { field: "idempotencyKey" });
    }
    if (!SHA256_DIGEST_PATTERN.test(identity.requestDigest)) {
        throw new LlmthinkServerError("invalid_argument", "requestDigest must use sha256 with 64 lowercase hexadecimal digits", { field: "requestDigest" });
    }
}
export function assertIdempotencyRetention(seconds) {
    if (!Number.isSafeInteger(seconds) ||
        seconds < MIN_IDEMPOTENCY_RETENTION_SECONDS ||
        seconds > MAX_IDEMPOTENCY_RETENTION_SECONDS) {
        throw new LlmthinkServerError("invalid_argument", `idempotency retention must be ${MIN_IDEMPOTENCY_RETENTION_SECONDS}-${MAX_IDEMPOTENCY_RETENTION_SECONDS} seconds`, { field: "idempotencyRetentionSeconds" });
    }
}
export function assertThoughtRef(ref, context) {
    assertHostedId("tenantId", ref.tenantId);
    assertHostedId("workspaceId", ref.workspaceId);
    assertHostedId("thoughtId", ref.thoughtId);
    if (ref.tenantId !== context.tenantId ||
        ref.workspaceId !== context.workspaceId) {
        throw new LlmthinkServerError("forbidden", "Thought scope mismatch");
    }
}
//# sourceMappingURL=contracts.js.map