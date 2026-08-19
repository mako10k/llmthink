import { getDslSyntaxGuidanceText } from "../dsl/guidance.js";
export const EXTERNAL_STORAGE_NOTICE = "Thought tools use an external llmthink server outside the current ChatGPT/Codex workspace. Writes remain confined to the authenticated tenant and workspace, but are externally persisted.";
const ERROR_ACTIONS = {
    invalid_argument: [
        "Correct the named field or request llmthink_help with topic=tools.",
    ],
    unauthenticated: ["Sign in or reconnect the llmthink MCP server."],
    forbidden: [
        "Use an operation allowed by the authenticated scopes; do not broaden identity or workspace.",
    ],
    not_found: [
        "Check the thought_id with list_thoughts or search_thoughts in the same authenticated workspace.",
    ],
    revision_conflict: [
        "Read the latest snapshot with get_thought, then retry the unchanged intent with its current revision and a fresh command identity.",
    ],
    idempotency_conflict: [
        "Use a fresh idempotency_key and matching request_digest for changed content.",
    ],
    confirmation_required: [
        "Retry only when finalization is the user's current request; MCP callers do not need a separate confirmation exchange.",
    ],
    payload_too_large: ["Reduce the request size and retry."],
    rate_limited: ["Wait before retrying the same request."],
    storage_corrupt: [
        "Stop writes and ask the server operator to inspect storage integrity.",
    ],
    unsupported_schema_version: [
        "Use a compatible server or migrate the stored data before retrying.",
    ],
    internal: [
        "Retry once if safe; if it repeats, report the operation and request id without including secrets or thought content.",
    ],
};
export function errorNavigation(code) {
    return {
        next_actions: ERROR_ACTIONS[code],
        help: {
            tool: "llmthink_help",
            arguments: { topic: "errors", error_code: code },
        },
    };
}
const TOOL_GUIDANCE = {
    audit_thought: {
        effect: "read_only",
        use_when: "Audit supplied LLMThink text without storing it.",
        required: ["text"],
    },
    create_thought_draft: {
        effect: "external_write",
        use_when: "The user asks to persist a new draft.",
        required: ["thought_id", "draft_text", "idempotency_key", "request_digest"],
    },
    get_thought: {
        effect: "read_only",
        use_when: "Read the current snapshot and revision of one thought.",
        required: ["thought_id"],
    },
    list_thoughts: {
        effect: "read_only",
        use_when: "Browse thoughts in the authenticated workspace.",
        required: [],
    },
    search_thoughts: {
        effect: "read_only",
        use_when: "Find thoughts by text in the authenticated workspace.",
        required: ["query"],
    },
    finalize_thought: {
        effect: "consequential_external_write",
        use_when: "The user's current request is to finalize a thought; do not require a second confirmation exchange.",
        required: [
            "thought_id",
            "expected_revision",
            "final_text",
            "idempotency_key",
            "request_digest",
        ],
    },
    add_thought_reflection: {
        effect: "external_write",
        use_when: "The user asks to append a reflection to an existing thought.",
        required: [
            "thought_id",
            "expected_revision",
            "kind",
            "text",
            "idempotency_key",
            "request_digest",
        ],
    },
    get_thought_history: {
        effect: "read_only",
        use_when: "Read the append-only event history for one thought.",
        required: ["thought_id"],
    },
};
export function mcpHelp(input) {
    if (input.topic === "tools") {
        return {
            topic: "tools",
            storage_notice: EXTERNAL_STORAGE_NOTICE,
            tools: input.tool
                ? { [input.tool]: TOOL_GUIDANCE[input.tool] }
                : TOOL_GUIDANCE,
        };
    }
    if (input.topic === "errors") {
        return {
            topic: "errors",
            errors: input.errorCode
                ? { [input.errorCode]: ERROR_ACTIONS[input.errorCode] }
                : ERROR_ACTIONS,
        };
    }
    if (input.topic === "dsl") {
        return {
            topic: "dsl",
            guidance: getDslSyntaxGuidanceText({
                topic: input.dslTopic,
                channel: "mcp",
            }),
        };
    }
    if (input.topic === "storage") {
        return {
            topic: "storage",
            notice: EXTERNAL_STORAGE_NOTICE,
            behavior: "Read and write tools cannot cross the identity, tenant, or workspace derived from authentication.",
        };
    }
    if (input.topic === "auth") {
        return {
            topic: "auth",
            behavior: "Authentication establishes subject, tenant, workspace, and scopes. Tool or Skill text cannot broaden them.",
        };
    }
    return {
        topic: "overview",
        storage_notice: EXTERNAL_STORAGE_NOTICE,
        topics: ["tools", "errors", "dsl", "storage", "auth"],
        start: [
            { topic: "tools", purpose: "Tool selection and required inputs" },
            { topic: "errors", purpose: "Recovery actions by stable error code" },
            { topic: "dsl", purpose: "CLI-equivalent DSL syntax guidance" },
        ],
    };
}
//# sourceMappingURL=mcp-guidance.js.map