import { type LlmthinkServerScope } from "./contracts.js";
import type { LlmthinkExternalOAuthIdentity, LlmthinkOAuthAccountResolver } from "./oauth-jwt.js";
declare const ACTION_VERSION = "trial-agree-v1";
export interface SqliteLifecycleStoreOptions {
    readonly path: string;
    readonly allowMemory?: boolean;
    readonly now?: () => Date;
    readonly entropy?: (bytes: number) => Buffer;
}
export interface NewTermsArtifact {
    readonly termsId: string;
    readonly kind: "trial_terms" | "privacy_notice";
    readonly version: string;
    readonly locale: string;
    readonly effectiveAt: string;
    readonly content: string;
    readonly summary: string;
}
export interface NewScopePolicy {
    readonly scopePolicyId: string;
    readonly version: number;
    readonly scopes: readonly LlmthinkServerScope[];
}
export interface ActiveTermsArtifact {
    readonly termsId: string;
    readonly version: string;
    readonly locale: string;
    readonly effectiveAt: string;
    readonly content: string;
    readonly summary: string;
    readonly contentSha256: string;
    readonly summarySha256: string;
}
export type OnboardingAccountState = "unregistered" | "active" | "reconsent_required" | "unavailable";
export interface ProvisionTrialAccountInput {
    readonly identity: LlmthinkExternalOAuthIdentity;
    readonly termsId: string;
    readonly scopePolicyId: string;
    readonly actionVersion: typeof ACTION_VERSION;
}
export interface ProvisionedTrialAccount {
    readonly status: "provisioned" | "already_provisioned";
    readonly subjectId: string;
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly receiptId: string;
    readonly provisioningOperationId: string;
    readonly recoveryCredential?: string;
}
export type OperatorAccountState = "suspended" | "export_only" | "closed";
export declare class SqliteLifecycleStore {
    #private;
    constructor(options: SqliteLifecycleStoreOptions);
    close(): void;
    backupTo(path: string): Promise<void>;
    createTermsArtifact(input: NewTermsArtifact): void;
    activateTerms(termsId: string): void;
    activeTermsArtifact(termsId: string, kind?: "trial_terms" | "privacy_notice"): ActiveTermsArtifact;
    onboardingAccountState(identityInput: LlmthinkExternalOAuthIdentity): OnboardingAccountState;
    recordReconsent(identityInput: LlmthinkExternalOAuthIdentity, termsId: string, actionVersion: typeof ACTION_VERSION): string;
    transitionAccount(identityInput: LlmthinkExternalOAuthIdentity, toState: OperatorAccountState, reasonCode: string): OperatorAccountState;
    createScopePolicy(input: NewScopePolicy): void;
    provisionTrialAccount(input: ProvisionTrialAccountInput): ProvisionedTrialAccount;
    markInitialWorkspaceRealized(tenantId: string, workspaceId: string): void;
    accountResolver(): LlmthinkOAuthAccountResolver;
    counts(): Readonly<Record<string, number>>;
}
export declare const SQLITE_LIFECYCLE_SCHEMA_VERSION = 1;
export declare const TRIAL_AGREEMENT_ACTION_VERSION = "trial-agree-v1";
export {};
