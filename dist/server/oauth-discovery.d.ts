import type { LlmthinkServerScope } from "./contracts.js";
export declare const OAUTH_PROTECTED_RESOURCE_PATH = "/.well-known/oauth-protected-resource";
export interface LlmthinkOAuthDiscoveryOptions {
    readonly resource: string;
    readonly authorizationServers: readonly string[];
    readonly scopesSupported: readonly LlmthinkServerScope[];
    readonly resourceDocumentation?: string;
}
export interface LlmthinkOAuthDiscovery {
    readonly resource: string;
    readonly resourceMetadataUrl: string;
    readonly authorizationServers: readonly string[];
    readonly scopesSupported: readonly LlmthinkServerScope[];
    readonly resourceDocumentation?: string;
}
export declare function createLlmthinkOAuthDiscovery(options: LlmthinkOAuthDiscoveryOptions): LlmthinkOAuthDiscovery;
export declare function oauthProtectedResourceMetadata(discovery: LlmthinkOAuthDiscovery): Record<string, unknown>;
export declare function oauthBearerChallenge(discovery: LlmthinkOAuthDiscovery, error?: "invalid_token" | "insufficient_scope", scopes?: readonly LlmthinkServerScope[]): string;
