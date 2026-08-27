import { type DslqlExpression, type DslqlSourceRange } from "./ast.js";
export interface DslqlReference {
    id: string;
    range: DslqlSourceRange;
}
export declare function collectDslqlReferences(expression: string | DslqlExpression): DslqlReference[];
export declare function collectDslqlReferenceIds(expression: string | DslqlExpression): string[];
