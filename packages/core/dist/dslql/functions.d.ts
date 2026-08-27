export type DslqlFunctionCategory = "core" | "relation" | "context" | "semantic";
export interface DslqlFunctionArity {
    minimum: number;
    maximum: number;
}
export interface DSLQLFunctionSpec {
    name: string;
    category: DslqlFunctionCategory;
    arity: DslqlFunctionArity;
    operands: readonly string[];
    result: string;
    semantic: boolean;
    summary: string;
}
export declare const DSLQL_FUNCTION_SPECS: readonly DSLQLFunctionSpec[];
export declare function getDslqlFunctionSpec(name: string): DSLQLFunctionSpec | undefined;
export declare function listDslqlFunctionSpecs(categories?: readonly DslqlFunctionCategory[]): DSLQLFunctionSpec[];
export declare function acceptsDslqlFunctionArity(functionSpec: DSLQLFunctionSpec, count: number): boolean;
export declare function formatDslqlFunctionArity(functionSpec: DSLQLFunctionSpec): string;
export declare function assertDslqlFunctionImplementationCoverage(categories: readonly DslqlFunctionCategory[], implementedNames: readonly string[]): void;
