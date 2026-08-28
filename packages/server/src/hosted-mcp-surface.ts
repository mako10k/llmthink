import type { HostedMcpSurfaceContract } from "@llmthink/contracts";

export const HOSTED_MCP_TOOL_NAMES = {
  onboarding: "begin_llmthink_onboarding",
  help: "llmthink_help",
  audit: "audit_thought",
  create: "create_thought_draft",
  get: "get_thought",
  list: "list_thoughts",
  search: "search_thoughts",
  finalize: "finalize_thought",
  reflect: "add_thought_reflection",
  delete: "delete_thought",
  history: "get_thought_history",
} as const;

const SURFACES = {
  onboarding: [
    {
      name: HOSTED_MCP_TOOL_NAMES.onboarding,
      effect: "external_write",
      required: [],
    },
  ],
  admitted: [
    {
      name: HOSTED_MCP_TOOL_NAMES.help,
      effect: "read_only",
      required: [],
    },
    {
      name: HOSTED_MCP_TOOL_NAMES.audit,
      effect: "read_only",
      required: ["text"],
    },
    {
      name: HOSTED_MCP_TOOL_NAMES.create,
      effect: "external_write",
      required: [
        "thought_id",
        "draft_text",
        "idempotency_key",
        "request_digest",
      ],
    },
    {
      name: HOSTED_MCP_TOOL_NAMES.get,
      effect: "read_only",
      required: ["thought_id"],
    },
    {
      name: HOSTED_MCP_TOOL_NAMES.list,
      effect: "read_only",
      required: [],
    },
    {
      name: HOSTED_MCP_TOOL_NAMES.search,
      effect: "read_only",
      required: ["query"],
    },
    {
      name: HOSTED_MCP_TOOL_NAMES.finalize,
      effect: "consequential_external_write",
      required: [
        "thought_id",
        "expected_revision",
        "final_text",
        "idempotency_key",
        "request_digest",
      ],
    },
    {
      name: HOSTED_MCP_TOOL_NAMES.reflect,
      effect: "external_write",
      required: [
        "thought_id",
        "expected_revision",
        "kind",
        "text",
        "idempotency_key",
        "request_digest",
      ],
    },
    {
      name: HOSTED_MCP_TOOL_NAMES.delete,
      effect: "consequential_external_write",
      required: [
        "thought_id",
        "expected_revision",
        "idempotency_key",
        "request_digest",
      ],
    },
    {
      name: HOSTED_MCP_TOOL_NAMES.history,
      effect: "read_only",
      required: ["thought_id"],
    },
  ],
} as const satisfies HostedMcpSurfaceContract["surfaces"];

export function hostedMcpProducerSurface(): HostedMcpSurfaceContract["surfaces"] {
  return structuredClone(SURFACES);
}

export function hostedMcpProducerDescriptor(source: {
  readonly repository: string;
  readonly revision: string;
}): HostedMcpSurfaceContract {
  return {
    schema_version: 1,
    contract_id: "llmthink-hosted-mcp",
    contract_version: "1",
    source,
    surfaces: hostedMcpProducerSurface(),
  };
}
