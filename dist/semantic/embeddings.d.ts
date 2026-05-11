export type EmbeddingProviderName = "none" | "ollama" | "openai";
export interface EmbeddingRequestOptions {
    provider?: EmbeddingProviderName;
}
interface EmbeddingResult {
    embeddings: number[][];
    provider: Exclude<EmbeddingProviderName, "none">;
    model: string;
}
export declare function embedTexts(texts: string[], options?: EmbeddingRequestOptions): Promise<EmbeddingResult | undefined>;
export declare function cosineSimilarity(left: number[], right: number[]): number;
export {};
