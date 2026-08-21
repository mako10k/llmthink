import { type LlmthinkServerScope } from "./contracts.js";
import type { LlmthinkExternalOAuthIdentity, LlmthinkOAuthAccountResolver } from "./oauth-jwt.js";
declare const ACTION_VERSION = "trial-agree-v1";
export interface SqliteLifecycleStoreOptions {
    readonly path: string;
    readonly createNew?: boolean;
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
export interface RecoveryRequest {
    readonly recoveryRequestId: string;
    readonly status: "pending_operator_review";
}
export interface ApprovedRecovery {
    readonly recoveryRequestId: string;
    readonly mappingRevision: number;
    readonly recoveryCredential: string;
}
export interface ArchiveReceipt {
    readonly archiveReceiptId: string;
    readonly formatVersion: "llmthink-archive-v1";
    readonly contentSha256: string;
    readonly byteLength: number;
    readonly itemCount: number;
    readonly createdAt: string;
}
export interface ArchiveAccessContext {
    readonly subjectId: string;
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly scopes: readonly ["thought:read"];
    readonly requestId: string;
}
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
    requestRecovery(recoveryCredential: string, proposedIdentityInput: LlmthinkExternalOAuthIdentity): RecoveryRequest;
    approveRecovery(recoveryRequestId: string, reviewerReference: string): ApprovedRecovery;
    rejectRecovery(recoveryRequestId: string, reviewerReference: string): void;
    recordArchive(identityInput: LlmthinkExternalOAuthIdentity, input: {
        readonly contentSha256: string;
        readonly byteLength: number;
        readonly itemCount: number;
    }): ArchiveReceipt;
    archiveContext(identityInput: LlmthinkExternalOAuthIdentity): ArchiveAccessContext;
    createScopePolicy(input: NewScopePolicy): void;
    provisionTrialAccount(input: ProvisionTrialAccountInput): ProvisionedTrialAccount;
    markInitialWorkspaceRealized(tenantId: string, workspaceId: string): void;
    accountResolver(): LlmthinkOAuthAccountResolver;
    counts(): Readonly<Record<string, number>>;
}
export declare const SQLITE_LIFECYCLE_SCHEMA_VERSION = 2;
export declare const SQLITE_LIFECYCLE_MIGRATION_0001_SHA256: string;
export declare const TRIAL_AGREEMENT_ACTION_VERSION = "trial-agree-v1";
export {};
