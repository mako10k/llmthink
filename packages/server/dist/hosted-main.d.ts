#!/usr/bin/env node
import { type LlmthinkServerScope } from "./contracts.js";
export interface HostedMcpRuntimeConfig {
    readonly hostname: string;
    readonly port: number;
    readonly dataRoot: string;
    readonly bearerToken: string;
    readonly subjectId: string;
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly scopes: readonly LlmthinkServerScope[];
}
export declare function loadHostedMcpRuntimeConfig(env: NodeJS.ProcessEnv): HostedMcpRuntimeConfig;
export declare function startHostedMcpServer(config: HostedMcpRuntimeConfig): Promise<void>;
