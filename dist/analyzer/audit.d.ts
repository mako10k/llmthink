import type { AuditReport } from "../model/diagnostics.js";
import { type EmbeddingRequestOptions } from "../semantic/embeddings.js";
interface AuditOptions {
    embeddings?: EmbeddingRequestOptions;
}
export declare function auditDslText(input: string, documentId?: string, options?: AuditOptions): Promise<AuditReport>;
export declare function auditDslFile(filePath: string, options?: AuditOptions): Promise<AuditReport>;
export {};
