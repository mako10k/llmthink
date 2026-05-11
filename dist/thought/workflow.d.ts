import type { AuditReport } from "../model/diagnostics.js";
import { type ThoughtRecord } from "./store.js";
export type ThoughtIdSource = "explicit" | "file" | "document" | "generated";
export interface PersistedThoughtAudit {
    thoughtId: string;
    idSource: ThoughtIdSource;
    report: AuditReport;
    record: ThoughtRecord;
}
export interface PersistedThoughtAuditRequest {
    dslText?: string;
    filePath?: string;
    thoughtId?: string;
    documentId?: string;
}
export declare function normalizeThoughtId(value: string): string;
export declare function deriveThoughtIdFromDocumentId(documentId: string): string;
export declare function deriveThoughtIdFromFilePath(filePath: string, baseDir?: string): string;
export declare function auditAndPersistThought(request: PersistedThoughtAuditRequest, baseDir?: string): Promise<PersistedThoughtAudit>;
