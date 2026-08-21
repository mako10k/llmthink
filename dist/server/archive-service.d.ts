import type { ThoughtRepository } from "./contracts.js";
import type { LlmthinkExternalOAuthIdentity } from "./oauth-jwt.js";
import type { ArchiveAccessContext, ArchiveReceipt } from "./sqlite-lifecycle-store.js";
export interface ArchiveLifecycleAuthority {
    archiveContext(identity: LlmthinkExternalOAuthIdentity): ArchiveAccessContext;
    recordArchive(identity: LlmthinkExternalOAuthIdentity, input: {
        readonly contentSha256: string;
        readonly byteLength: number;
        readonly itemCount: number;
    }): ArchiveReceipt;
}
export interface LlmthinkArchive {
    readonly contentType: "application/json; charset=utf-8";
    readonly bytes: Uint8Array;
    readonly receipt: ArchiveReceipt;
}
export interface LlmthinkArchiveServiceOptions {
    readonly repository: ThoughtRepository;
    readonly lifecycle: ArchiveLifecycleAuthority;
    readonly maxBytes?: number;
    readonly maxItems?: number;
}
export declare class LlmthinkArchiveService {
    #private;
    constructor(options: LlmthinkArchiveServiceOptions);
    create(identity: LlmthinkExternalOAuthIdentity): Promise<LlmthinkArchive>;
}
