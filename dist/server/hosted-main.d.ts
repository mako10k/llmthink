#!/usr/bin/env node
import { type LlmthinkServerScope } from "./contracts.js";
import { type LlmthinkOAuthDiscovery } from "./oauth-discovery.js";
export interface HostedLifecycleRuntimeConfig {
    readonly databasePath: string;
    readonly publicOrigin: string;
    readonly termsId: string;
    readonly privacyNoticeId: string;
    readonly scopePolicyId: string;
}
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
    readonly lifecycle?: HostedLifecycleRuntimeConfig;
}
export declare function loadHostedMcpRuntimeConfig(env: NodeJS.ProcessEnv): HostedMcpRuntimeConfig;
export declare function startHostedMcpServer(config: HostedMcpRuntimeConfig): Promise<void>;
