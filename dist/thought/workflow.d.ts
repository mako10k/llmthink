import { type AuditReport } from "@llmthink/core";
import { type ThoughtRecord } from "./store.js";
export type ThoughtIdSource = "explicit" | "file" | "document" | "generated";
export interface PersistedThoughtAudit {
    thoughtId: string;
    idSource: ThoughtIdSource;
    report: AuditReport;
    record: ThoughtRecord;
}
interface PersistedThoughtAuditRequest {
    dslText?: string;
    filePath?: string;
    thoughtId?: string;
    documentId?: string;
}
interface PersistedThoughtContext {
    fileBaseDir?: string;
    storageRoot?: string;
}
export declare function normalizeThoughtId(value: string): string;
export declare function deriveThoughtIdFromDocumentId(documentId: string): string;
export declare function deriveThoughtIdFromFilePath(filePath: string, baseDir?: string): string;
export declare function auditAndPersistThought(request: PersistedThoughtAuditRequest, contextOrBaseDir?: PersistedThoughtContext | string, legacyStorageRoot?: string): Promise<PersistedThoughtAudit>;
export {};
