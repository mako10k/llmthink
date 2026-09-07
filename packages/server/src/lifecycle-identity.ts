import type { LlmthinkServerScope } from "./contracts.js";

export interface LlmthinkExternalAccountIdentity {
  readonly issuer: string;
  readonly subjectId: string;
  readonly organizationId?: string;
}

export interface LlmthinkLifecycleAccountContext {
  readonly subjectId: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly scopes: readonly LlmthinkServerScope[];
}

export type LlmthinkLifecycleAccountResolver = (
  identity: LlmthinkExternalAccountIdentity,
) => Promise<LlmthinkLifecycleAccountContext>;
