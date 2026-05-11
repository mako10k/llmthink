type DslqlLiteral = string | number | boolean | null;
export type DslqlValue = DslqlLiteral | DslqlValue[] | {
    [key: string]: DslqlValue | undefined;
};
export interface DslqlRuntime {
    root: DslqlValue;
    functions?: Record<string, (input: DslqlValue[], args: DslqlValue[], runtime: DslqlRuntime) => DslqlValue[]>;
}
type ComparisonOperator = "==" | "!=" | ">" | ">=" | "<" | "<=";
type BinaryOperator = ComparisonOperator | "and" | "or";
interface PathSegmentField {
    type: "field";
    name: string;
    optional: boolean;
}
interface PathSegmentIterate {
    type: "iterate";
}
type PathSegment = PathSegmentField | PathSegmentIterate;
interface PathExpression {
    type: "path";
    segments: PathSegment[];
}
interface CallExpression {
    type: "call";
    name: string;
    args: DslqlExpression[];
}
interface ObjectExpression {
    type: "object";
    fields: Array<{
        key: string;
        value: DslqlExpression;
    }>;
}
interface ArrayCollectExpression {
    type: "collect";
    expression: DslqlExpression;
}
interface LiteralExpression {
    type: "literal";
    value: DslqlLiteral;
}
interface UnaryExpression {
    type: "unary";
    operator: "not";
    operand: DslqlExpression;
}
interface BinaryExpression {
    type: "binary";
    operator: BinaryOperator;
    left: DslqlExpression;
    right: DslqlExpression;
}
interface PipeExpression {
    type: "pipe";
    stages: DslqlExpression[];
}
export type DslqlExpression = ArrayCollectExpression | BinaryExpression | CallExpression | LiteralExpression | ObjectExpression | PathExpression | PipeExpression | UnaryExpression;
export declare class DslqlParseError extends Error {
    readonly column: number;
    readonly endColumn: number;
    constructor(message: string, column: number, endColumn?: number);
}
export declare function parseDslqlExpression(input: string): DslqlExpression;
export declare function collectDslqlReferenceIds(input: string): string[];
export declare function evaluateDslqlExpression(input: string, runtime: DslqlRuntime): DslqlValue[];
export {};
