import type { ThoughtEvent } from "../thought/store.js";
import { type AddReflectionCommand, type CreateThoughtCommand, type DeleteThoughtCommand, type RecordAuditCommand, type RequestContext, type SaveDraftCommand, type ServerThoughtSnapshot, type ThoughtListQuery, type ThoughtDeletionReceipt, type ThoughtPage, type ThoughtRef, type ThoughtRepository, type ThoughtSearchQuery, type FinalizeThoughtCommand } from "./contracts.js";
export interface ServerFileThoughtRepositoryOptions {
    readonly dataRoot: string;
    readonly idempotencyRetentionSeconds?: number;
    readonly clock?: () => Date;
}
export declare class ServerFileThoughtRepository implements ThoughtRepository {
    readonly dataRoot: string;
    readonly idempotencyRetentionSeconds: number;
    readonly clock: () => Date;
    readonly writes: Map<string, Promise<void>>;
    constructor(options: ServerFileThoughtRepositoryOptions);
    create(command: CreateThoughtCommand, context: RequestContext): Promise<ServerThoughtSnapshot>;
    get(ref: ThoughtRef, context: RequestContext): Promise<ServerThoughtSnapshot | null>;
    list(query: ThoughtListQuery, context: RequestContext): Promise<ThoughtPage>;
    search(query: ThoughtSearchQuery, context: RequestContext): Promise<ThoughtPage>;
    saveDraft(command: SaveDraftCommand, context: RequestContext): Promise<ServerThoughtSnapshot>;
    recordAudit(command: RecordAuditCommand, context: RequestContext): Promise<ServerThoughtSnapshot>;
    finalize(command: FinalizeThoughtCommand, context: RequestContext): Promise<ServerThoughtSnapshot>;
    addReflection(command: AddReflectionCommand, context: RequestContext): Promise<ServerThoughtSnapshot>;
    events(ref: ThoughtRef, context: RequestContext): Promise<readonly ThoughtEvent[]>;
    delete(command: DeleteThoughtCommand, context: RequestContext): Promise<ThoughtDeletionReceipt>;
    private update;
    private commit;
    private writeRevisionFiles;
    private readCurrent;
    private readFiles;
    private readRevision;
    private parseJsonLines;
    private required;
    private idempotentReplay;
    private replayFromCurrentRevision;
    private commandRecord;
    private readRevisionCommand;
    private sameCommand;
    private remember;
    private serialized;
    private ref;
    private thoughtsPath;
    private thoughtPath;
    private currentPath;
    private idempotencyPath;
    private deletionReceiptPath;
    private assertPageQuery;
    private encodeCursor;
    private decodeCursor;
}
