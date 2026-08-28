export type JsonObject = Readonly<Record<string, unknown>>;
export declare const MCP_TOOL_EFFECTS: readonly ["read_only", "external_write", "consequential_external_write"];
export type McpToolEffect = (typeof MCP_TOOL_EFFECTS)[number];
export interface McpSurfaceTool {
    readonly name: string;
    readonly effect: McpToolEffect;
    readonly required: readonly string[];
}
export interface HostedMcpSurfaceContract {
    readonly schema_version: 1;
    readonly contract_id: string;
    readonly contract_version: string;
    readonly source: {
        readonly repository: string;
        readonly revision: string;
    };
    readonly surfaces: {
        readonly onboarding: readonly McpSurfaceTool[];
        readonly admitted: readonly McpSurfaceTool[];
    };
}
export interface ContractArtifactManifest {
    readonly role: "surface" | "schemas";
    readonly path: string;
    readonly sha256: string;
}
export interface ContractManifest {
    readonly schema_version: 1;
    readonly package_name: string;
    readonly package_version: string;
    readonly contract_id: string;
    readonly contract_version: string;
    readonly artifacts: readonly ContractArtifactManifest[];
    readonly provenance: {
        readonly tested_producer_revision: string;
        readonly retained_source_revision: string;
        readonly tested_consumer_repository: string;
        readonly tested_consumer_revision: string;
    };
}
export interface ContractVerificationReport {
    readonly package_name: string;
    readonly package_version: string;
    readonly contract_id: string;
    readonly contract_version: string;
    readonly artifacts: readonly {
        readonly role: string;
        readonly path: string;
        readonly sha256: string;
    }[];
    readonly tool_count: number;
}
export declare function validateSurfaceContract(value: unknown): HostedMcpSurfaceContract;
export declare function validateSchemaSet(value: unknown, surface: HostedMcpSurfaceContract): void;
export declare function sha256(value: Uint8Array | string): string;
export declare function assertSurfaceConformance(expectedValue: unknown, candidateValue: unknown): void;
export declare function assertExactContractBytes(expected: Uint8Array, candidate: Uint8Array): void;
export declare function verifyContractPackage(packageRoot: string): Promise<ContractVerificationReport>;
export declare function verifyCandidateFiles(options: {
    readonly contractPath: string;
    readonly candidatePath: string;
    readonly exact?: boolean;
}): Promise<void>;
