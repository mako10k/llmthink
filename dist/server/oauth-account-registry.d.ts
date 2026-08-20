import type { LlmthinkOAuthAccountResolver } from "./oauth-jwt.js";
export declare const OAUTH_ACCOUNT_REGISTRY_VERSION = 1;
export declare const OAUTH_ACCOUNT_REGISTRY_MAX_BYTES: number;
export declare function loadOAuthAccountRegistry(path: string): Promise<LlmthinkOAuthAccountResolver>;
