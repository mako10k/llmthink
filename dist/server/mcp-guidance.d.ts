import type { LlmthinkServerErrorCode } from "./contracts.js";
export declare const EXTERNAL_STORAGE_NOTICE = "Thought tools use an external llmthink server outside the current ChatGPT/Codex workspace. Writes remain confined to the authenticated tenant and workspace, but are externally persisted.";
export declare const REQUEST_DIGEST_PATTERN = "^sha256:[a-f0-9]{64}$";
export declare const REQUEST_DIGEST_DESCRIPTION = "Request identity digest. Expected sha256:<64 lowercase hex> (pattern ^sha256:[a-f0-9]{64}$). Compute SHA-256 over a stable UTF-8 representation of the mutation fields; exclude idempotency_key and request_digest.";
export declare function errorNavigation(code: LlmthinkServerErrorCode): {
    next_actions: readonly string[];
    help: {
        tool: string;
        arguments: {
            topic: string;
            error_code: "invalid_argument" | "unauthenticated" | "forbidden" | "not_found" | "revision_conflict" | "idempotency_conflict" | "confirmation_required" | "payload_too_large" | "rate_limited" | "storage_corrupt" | "unsupported_schema_version" | "internal";
        };
    };
};
declare const TOOL_GUIDANCE: {
    readonly audit_thought: {
        readonly effect: "read_only";
        readonly use_when: "Audit supplied LLMThink text without storing it.";
        readonly required: readonly ["text"];
    };
    readonly create_thought_draft: {
        readonly effect: "external_write";
        readonly use_when: "The user asks to persist a new draft.";
        readonly required: readonly ["thought_id", "draft_text", "idempotency_key", "request_digest"];
        readonly request_digest: {
            readonly mutation_fields: readonly ["thought_id", "draft_text"];
            readonly format: "sha256:<64 lowercase hex>";
            readonly pattern: "^sha256:[a-f0-9]{64}$";
            readonly procedure: readonly ["Build an object from the mutation fields listed for the selected tool.", "Serialize it deterministically as UTF-8 (for example, canonical JSON with lexicographically sorted object keys and no insignificant whitespace).", "Compute SHA-256 over those bytes and prefix the 64-character lowercase hexadecimal result with sha256:."];
            readonly excludes: readonly ["idempotency_key", "request_digest"];
            readonly server_behavior: "The server validates the digest format and uses it to distinguish idempotent replays; it does not rederive the digest from request fields.";
            readonly example: `sha256:${string}`;
        };
    };
    readonly get_thought: {
        readonly effect: "read_only";
        readonly use_when: "Read the current snapshot and revision of one thought.";
        readonly required: readonly ["thought_id"];
    };
    readonly list_thoughts: {
        readonly effect: "read_only";
        readonly use_when: "Browse thoughts in the authenticated workspace.";
        readonly required: readonly [];
    };
    readonly search_thoughts: {
        readonly effect: "read_only";
        readonly use_when: "Find thoughts by text in the authenticated workspace.";
        readonly required: readonly ["query"];
    };
    readonly finalize_thought: {
        readonly effect: "consequential_external_write";
        readonly use_when: "The user's current request is to finalize a thought; do not require a second confirmation exchange.";
        readonly required: readonly ["thought_id", "expected_revision", "final_text", "idempotency_key", "request_digest"];
        readonly request_digest: {
            readonly mutation_fields: readonly ["thought_id", "expected_revision", "final_text"];
            readonly format: "sha256:<64 lowercase hex>";
            readonly pattern: "^sha256:[a-f0-9]{64}$";
            readonly procedure: readonly ["Build an object from the mutation fields listed for the selected tool.", "Serialize it deterministically as UTF-8 (for example, canonical JSON with lexicographically sorted object keys and no insignificant whitespace).", "Compute SHA-256 over those bytes and prefix the 64-character lowercase hexadecimal result with sha256:."];
            readonly excludes: readonly ["idempotency_key", "request_digest"];
            readonly server_behavior: "The server validates the digest format and uses it to distinguish idempotent replays; it does not rederive the digest from request fields.";
            readonly example: `sha256:${string}`;
        };
    };
    readonly add_thought_reflection: {
        readonly effect: "external_write";
        readonly use_when: "The user asks to append a reflection to an existing thought.";
        readonly required: readonly ["thought_id", "expected_revision", "kind", "text", "idempotency_key", "request_digest"];
        readonly request_digest: {
            readonly mutation_fields: readonly ["thought_id", "expected_revision", "kind", "text"];
            readonly format: "sha256:<64 lowercase hex>";
            readonly pattern: "^sha256:[a-f0-9]{64}$";
            readonly procedure: readonly ["Build an object from the mutation fields listed for the selected tool.", "Serialize it deterministically as UTF-8 (for example, canonical JSON with lexicographically sorted object keys and no insignificant whitespace).", "Compute SHA-256 over those bytes and prefix the 64-character lowercase hexadecimal result with sha256:."];
            readonly excludes: readonly ["idempotency_key", "request_digest"];
            readonly server_behavior: "The server validates the digest format and uses it to distinguish idempotent replays; it does not rederive the digest from request fields.";
            readonly example: `sha256:${string}`;
        };
    };
    readonly get_thought_history: {
        readonly effect: "read_only";
        readonly use_when: "Read the append-only event history for one thought.";
        readonly required: readonly ["thought_id"];
    };
};
type LlmthinkHelpTopic = "overview" | "tools" | "errors" | "dsl" | "storage" | "auth";
export declare function mcpHelp(input: {
    topic: LlmthinkHelpTopic;
    tool?: keyof typeof TOOL_GUIDANCE;
    errorCode?: LlmthinkServerErrorCode;
    dslTopic?: string;
}): Record<string, unknown>;
export {};
