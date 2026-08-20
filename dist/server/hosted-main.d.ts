#!/usr/bin/env node
import { type LlmthinkServerScope } from "./contracts.js";
import { type LlmthinkOAuthDiscovery } from "./oauth-discovery.js";
export interface HostedMcpRuntimeConfig {
    readonly hostname: string;
    readonly port: number;
    readonly dataRoot: string;
    readonly bearerToken: string;
    readonly subjectId: string;
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly scopes: readonly LlmthinkServerScope[];
    readonly oauthDiscovery?: LlmthinkOAuthDiscovery;
    readonly oauthJwksUri?: string;
    readonly oauthAccountRegistryPath?: string;
}
export declare function loadHostedMcpRuntimeConfig(env: NodeJS.ProcessEnv): HostedMcpRuntimeConfig;
export declare function startHostedMcpServer(config: HostedMcpRuntimeConfig): Promise<void>;
