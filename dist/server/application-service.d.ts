import { type AuditReport } from "@llmthink/core";
import type { ThoughtEvent } from "../thought/store.js";
import { type AddReflectionCommand, type AuditTextCommand, type CreateThoughtCommand, type FinalizeThoughtCommand, type PureAuditResult, type RecordAuditCommand, type RequestContext, type SaveDraftCommand, type ServerThoughtSnapshot, type ThoughtListQuery, type ThoughtPage, type ThoughtRef, type ThoughtRepository, type ThoughtSearchQuery } from "./contracts.js";
export type LlmthinkAuditRunner = (command: AuditTextCommand) => Promise<AuditReport>;
export interface LlmthinkApplicationServiceOptions {
    readonly repository: ThoughtRepository;
    readonly auditRunner?: LlmthinkAuditRunner;
}
export declare class LlmthinkApplicationService {
    readonly repository: ThoughtRepository;
    readonly auditRunner: LlmthinkAuditRunner;
    constructor(options: LlmthinkApplicationServiceOptions);
    audit(command: AuditTextCommand, context: RequestContext): Promise<PureAuditResult>;
    createThought(command: CreateThoughtCommand, context: RequestContext): Promise<ServerThoughtSnapshot>;
    getThought(ref: ThoughtRef, context: RequestContext): Promise<ServerThoughtSnapshot>;
    listThoughts(query: ThoughtListQuery, context: RequestContext): Promise<ThoughtPage>;
    searchThoughts(query: ThoughtSearchQuery, context: RequestContext): Promise<ThoughtPage>;
    saveDraft(command: SaveDraftCommand, context: RequestContext): Promise<ServerThoughtSnapshot>;
    recordAudit(command: RecordAuditCommand, context: RequestContext): Promise<ServerThoughtSnapshot>;
    finalizeThought(command: FinalizeThoughtCommand, context: RequestContext): Promise<ServerThoughtSnapshot>;
    addReflection(command: AddReflectionCommand, context: RequestContext): Promise<ServerThoughtSnapshot>;
    events(ref: ThoughtRef, context: RequestContext): Promise<readonly ThoughtEvent[]>;
    private assertRevisionCommand;
    private repositoryCall;
}
