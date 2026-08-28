import type { HostedMcpSurfaceContract } from "@llmthink/contracts";
export declare const HOSTED_MCP_TOOL_NAMES: {
    readonly onboarding: "begin_llmthink_onboarding";
    readonly help: "llmthink_help";
    readonly audit: "audit_thought";
    readonly create: "create_thought_draft";
    readonly get: "get_thought";
    readonly list: "list_thoughts";
    readonly search: "search_thoughts";
    readonly finalize: "finalize_thought";
    readonly reflect: "add_thought_reflection";
    readonly delete: "delete_thought";
    readonly history: "get_thought_history";
};
export declare function hostedMcpProducerSurface(): HostedMcpSurfaceContract["surfaces"];
export declare function hostedMcpProducerDescriptor(source: {
    readonly repository: string;
    readonly revision: string;
}): HostedMcpSurfaceContract;
