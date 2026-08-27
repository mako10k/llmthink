import { type DocumentAst } from "../model/ast.js";
export declare class ParseError extends Error {
    readonly line: number;
    readonly column: number;
    readonly endColumn: number;
    constructor(message: string, line: number, column?: number, endColumn?: number);
}
export declare function parseDocument(input: string): DocumentAst;
