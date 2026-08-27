export type ConfigDomain = "workspace" | "user" | "system";
type ConfigEmbeddingProvider = "none" | "ollama" | "openai";
export interface ResolveRuntimeConfigOptions {
    cwd?: string;
    workspaceDir?: string;
    filePath?: string;
    configFilePath?: string;
    storageDomain?: ConfigDomain;
    storagePath?: string;
    env?: NodeJS.ProcessEnv;
}
export interface ResolvedEmbeddingConfig {
    provider: ConfigEmbeddingProvider;
    timeoutMs: number;
    ollamaBaseUrl: string;
    ollamaModel: string;
    openaiBaseUrl: string;
    openaiModel: string;
    openaiApiKey?: string;
}
export interface ResolvedValueSource {
    layer: ConfigDomain | "env" | "cli" | "default";
    key: string;
    path?: string;
}
export interface ResolvedRuntimeConfig {
    configPaths: {
        workspace?: string;
        user?: string;
        system?: string;
    };
    storage: {
        root: string;
        domain: ConfigDomain;
    };
    embeddings: ResolvedEmbeddingConfig;
    sources: {
        storage: {
            root: ResolvedValueSource;
            domain: ResolvedValueSource;
        };
        embeddings: {
            provider: ResolvedValueSource;
            timeoutMs: ResolvedValueSource;
            ollamaBaseUrl: ResolvedValueSource;
            ollamaModel: ResolvedValueSource;
            openaiBaseUrl: ResolvedValueSource;
            openaiModel: ResolvedValueSource;
            openaiApiKey: ResolvedValueSource;
        };
    };
}
export declare function resolveThoughtStorageRoot(options?: ResolveRuntimeConfigOptions): string;
export declare function resolveEmbeddingConfig(options?: ResolveRuntimeConfigOptions): ResolvedEmbeddingConfig;
export declare function resolveRuntimeConfig(options?: ResolveRuntimeConfigOptions): ResolvedRuntimeConfig;
export {};
