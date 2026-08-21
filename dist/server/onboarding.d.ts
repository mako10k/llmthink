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
    readonly now?: () => number;
    readonly entropy?: (bytes: number) => Buffer;
    readonly nonceTtlMs?: number;
    readonly maxSessions?: number;
}
export declare function createLlmthinkOnboardingHandler(options: LlmthinkOnboardingOptions): LlmthinkOnboardingHttpHandler;
