import type { AuditReport } from "../model/diagnostics.js";
import { type DslqlSemanticEmbedder } from "../dslql/query.js";
import { type EmbeddingRequestOptions } from "../semantic/embeddings.js";
export interface AuditOptions {
    embeddings?: EmbeddingRequestOptions;
    semanticEmbedder?: DslqlSemanticEmbedder;
    semanticMaxOnDemandEmbeddings?: number;
}
export declare function auditDslText(input: string, documentId?: string, options?: AuditOptions): Promise<AuditReport>;
export declare function auditDslFile(filePath: string, options?: AuditOptions): Promise<AuditReport>;
