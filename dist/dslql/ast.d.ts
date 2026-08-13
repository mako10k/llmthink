export interface DslqlSourcePosition {
    offset: number;
    line: number;
    column: number;
}
export interface DslqlSourceRange {
    start: DslqlSourcePosition;
    end: DslqlSourcePosition;
}
export type DslqlLiteral = string | number | boolean | null;
interface DslqlNodeBase {
    range: DslqlSourceRange;
}
export interface DslqlLiteralExpression extends DslqlNodeBase {
    kind: "literal";
    value: DslqlLiteral;
}
export interface DslqlReferenceExpression extends DslqlNodeBase {
    kind: "reference";
    id: string;
}
export interface DslqlPropertySegment extends DslqlNodeBase {
    kind: "property";
    key: string;
    optional: boolean;
}
export interface DslqlIndexSegment extends DslqlNodeBase {
    kind: "index";
    index: number;
    optional: boolean;
}
export interface DslqlIterateSegment extends DslqlNodeBase {
    kind: "iterate";
    optional: boolean;
}
export type DslqlPathSegment = DslqlPropertySegment | DslqlIndexSegment | DslqlIterateSegment;
export interface DslqlPathExpression extends DslqlNodeBase {
    kind: "path";
    origin: "current" | "root";
    segments: DslqlPathSegment[];
}
export interface DslqlCallExpression extends DslqlNodeBase {
    kind: "call";
    name: string;
    arguments: DslqlExpression[];
}
export interface DslqlObjectField extends DslqlNodeBase {
    kind: "field";
    key: string;
    value: DslqlExpression;
}
export interface DslqlObjectExpression extends DslqlNodeBase {
    kind: "object";
    fields: DslqlObjectField[];
}
export interface DslqlArrayExpression extends DslqlNodeBase {
    kind: "array";
    elements: DslqlExpression[];
}
export interface DslqlUnaryExpression extends DslqlNodeBase {
    kind: "unary";
    operator: "not";
    operand: DslqlExpression;
}
export type DslqlComparisonOperator = "==" | "!=" | ">" | ">=" | "<" | "<=" | "in";
export type DslqlBinaryOperator = DslqlComparisonOperator | "and" | "or";
export interface DslqlBinaryExpression extends DslqlNodeBase {
    kind: "binary";
    operator: DslqlBinaryOperator;
    left: DslqlExpression;
    right: DslqlExpression;
}
export interface DslqlPipeExpression extends DslqlNodeBase {
    kind: "pipe";
    stages: DslqlExpression[];
}
export type DslqlExpression = DslqlArrayExpression | DslqlBinaryExpression | DslqlCallExpression | DslqlLiteralExpression | DslqlObjectExpression | DslqlPathExpression | DslqlPipeExpression | DslqlReferenceExpression | DslqlUnaryExpression;
export type DslqlAstNode = DslqlExpression | DslqlObjectField | DslqlPathSegment;
export type DslqlVisitor = (node: DslqlAstNode, parent: DslqlAstNode | undefined) => void;
export declare function visitDslqlAst(expression: DslqlExpression, visitor: DslqlVisitor): void;
export type DslqlTransformer = (node: DslqlAstNode) => DslqlAstNode | undefined;
export declare function transformDslqlAst(expression: DslqlExpression, transformer: DslqlTransformer): DslqlExpression;
export {};
