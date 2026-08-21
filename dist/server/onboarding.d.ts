import type { IncomingMessage, ServerResponse } from "node:http";
import type { LlmthinkExternalOAuthIdentity } from "./oauth-jwt.js";
import { SqliteLifecycleStore } from "./sqlite-lifecycle-store.js";
export interface OnboardingPrincipal {
    readonly identity: LlmthinkExternalOAuthIdentity;
    readonly requestId: string;
}
export type LlmthinkOnboardingAuthenticator = (request: IncomingMessage) => Promise<OnboardingPrincipal>;
export type LlmthinkOnboardingHttpHandler = (request: IncomingMessage, response: ServerResponse) => Promise<boolean>;
export interface LlmthinkOnboardingOptions {
    readonly store: SqliteLifecycleStore;
    readonly authenticate: LlmthinkOnboardingAuthenticator;
    readonly publicOrigin: string;
    readonly termsId: string;
    readonly privacyNoticeId: string;
    readonly scopePolicyId: string;
    readonly realizeInitialWorkspace?: (tenantId: string, workspaceId: string) => void | Promise<void>;
    readonly now?: () => number;
    readonly entropy?: (bytes: number) => Buffer;
    readonly nonceTtlMs?: number;
    readonly maxSessions?: number;
}
export interface LlmthinkOnboardingBridge {
    readonly handler: LlmthinkOnboardingHttpHandler;
    readonly issueUrl: (identity: LlmthinkExternalOAuthIdentity) => string;
}
export declare function createLlmthinkOnboardingBridge(options: LlmthinkOnboardingOptions): LlmthinkOnboardingBridge;
export declare function createLlmthinkOnboardingHandler(options: LlmthinkOnboardingOptions): LlmthinkOnboardingHttpHandler;
