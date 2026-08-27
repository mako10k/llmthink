import { type DslqlExpression, type DslqlSourceRange } from "./ast.js";
export type DslqlValue = string | number | boolean | null | DslqlValue[] | {
    [key: string]: DslqlValue;
};
export type DslqlObject = {
    [key: string]: DslqlValue;
};
export interface DslqlFunctionContext {
    input: readonly DslqlValue[];
    arguments: readonly DslqlExpression[];
    runtime: DslqlRuntime;
    evaluate: (expression: DslqlExpression, input?: readonly DslqlValue[]) => DslqlValue[];
}
export type DslqlFunction = (context: DslqlFunctionContext) => readonly DslqlValue[];
export interface DslqlRuntime {
    root: DslqlValue;
    functions?: Readonly<Record<string, DslqlFunction>>;
}
export declare class DslqlEvaluationError extends Error {
    readonly range?: DslqlSourceRange | undefined;
    constructor(message: string, range?: DslqlSourceRange | undefined);
}
export declare const DSLQL_BUILTIN_FUNCTION_NAMES: readonly string[];
export declare function evaluateDslqlExpression(expression: string | DslqlExpression, runtime: DslqlRuntime): DslqlValue[];
