import type { LlmthinkServerErrorCode } from "./contracts.js";
export declare const EXTERNAL_STORAGE_NOTICE = "Thought tools use an external llmthink server outside the current ChatGPT/Codex workspace. Writes remain confined to the authenticated tenant and workspace, but are externally persisted.";
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
    };
    readonly add_thought_reflection: {
        readonly effect: "external_write";
        readonly use_when: "The user asks to append a reflection to an existing thought.";
        readonly required: readonly ["thought_id", "expected_revision", "kind", "text", "idempotency_key", "request_digest"];
    };
    readonly get_thought_history: {
        readonly effect: "read_only";
        readonly use_when: "Read the append-only event history for one thought.";
        readonly required: readonly ["thought_id"];
    };
};
export type LlmthinkHelpTopic = "overview" | "tools" | "errors" | "dsl" | "storage" | "auth";
export declare function mcpHelp(input: {
    topic: LlmthinkHelpTopic;
    tool?: keyof typeof TOOL_GUIDANCE;
    errorCode?: LlmthinkServerErrorCode;
    dslTopic?: string;
}): Record<string, unknown>;
export {};
