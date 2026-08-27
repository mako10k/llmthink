import type { DocumentAst } from "../model/ast.js";
import { type EmbeddingRequestOptions } from "../semantic/embeddings.js";
import { type DslqlExpression, type DslqlSourceRange } from "./ast.js";
import { DslqlEvaluationError, type DslqlObject, type DslqlRuntime, type DslqlValue } from "./evaluator.js";
import { type DocumentDslqlRuntimeOptions } from "./runtime.js";
export interface DslqlSemanticEmbeddingResult {
    embeddings: number[][];
    provider: string;
    model: string;
}
export type DslqlSemanticEmbedder = (texts: string[]) => Promise<DslqlSemanticEmbeddingResult | undefined>;
export type DslqlSemanticTextSelector = (value: DslqlObject) => string | undefined;
export interface SemanticDslqlRuntimeOptions {
    embeddings?: EmbeddingRequestOptions;
    embedder?: DslqlSemanticEmbedder;
    selectText?: DslqlSemanticTextSelector;
    maxOnDemandEmbeddings?: number;
}
export interface SemanticDocumentDslqlRuntimeOptions extends DocumentDslqlRuntimeOptions, SemanticDslqlRuntimeOptions {
}
export declare class DslqlSemanticError extends DslqlEvaluationError {
    constructor(message: string, range?: DslqlSourceRange);
}
export declare class DslqlSemanticUnavailableError extends DslqlSemanticError {
    constructor(message: string);
}
export declare const DEFAULT_DSLQL_ON_DEMAND_EMBEDDING_LIMIT = 8;
export declare function usesSemanticDslql(expression: string | DslqlExpression): boolean;
export declare function createSemanticDslqlRuntime(runtime: DslqlRuntime, expression: string | DslqlExpression, options?: SemanticDslqlRuntimeOptions): Promise<DslqlRuntime>;
export declare function createSemanticDocumentDslqlRuntime(documentAst: DocumentAst, expression: string | DslqlExpression, options?: SemanticDocumentDslqlRuntimeOptions): Promise<DslqlRuntime>;
export declare function evaluateSemanticDslqlExpression(expression: string | DslqlExpression, runtime: DslqlRuntime, options?: SemanticDslqlRuntimeOptions): Promise<DslqlValue[]>;
export declare function evaluateSemanticDocumentDslqlExpression(expression: string | DslqlExpression, documentAst: DocumentAst, options?: SemanticDocumentDslqlRuntimeOptions): Promise<DslqlValue[]>;
