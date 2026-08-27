import { type DslqlExpression, type DslqlSourceRange } from "./ast.js";
export declare class DslqlParseError extends Error {
    readonly offset: number;
    readonly endOffset: number;
    readonly line: number;
    readonly column: number;
    readonly endLine: number;
    readonly endColumn: number;
    constructor(message: string, range: DslqlSourceRange);
}
export declare function parseDslqlExpression(input: string): DslqlExpression;
