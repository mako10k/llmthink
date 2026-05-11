export interface DslExampleEntry {
    id: string;
    path: string;
    summary: string;
}
export declare const DSL_EXAMPLES: DslExampleEntry[];
export declare function getDslExample(id: string): DslExampleEntry | undefined;
export declare function listDslExamples(ids?: string[]): DslExampleEntry[];
export declare function resolveDslExamplePath(id: string, cwd?: string): string | undefined;
