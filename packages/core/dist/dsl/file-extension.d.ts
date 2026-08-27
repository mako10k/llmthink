export declare const LLMTHINK_CANONICAL_FILE_EXTENSION: ".think";
export declare const LLMTHINK_LEGACY_FILE_EXTENSIONS: readonly [".dsl"];
export declare const LLMTHINK_FILE_EXTENSIONS: readonly [".think", ".dsl"];
export type LlmthinkFileExtension = (typeof LLMTHINK_FILE_EXTENSIONS)[number];
export declare function llmthinkFileExtension(value: string): LlmthinkFileExtension | undefined;
export declare function isLlmthinkFilePath(value: string): boolean;
export declare function stripLlmthinkFileExtension(value: string): string;
export declare function alternateLlmthinkFilePath(value: string): string | undefined;
