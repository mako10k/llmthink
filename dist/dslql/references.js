import { visitDslqlAst, } from "./ast.js";
import { parseDslqlExpression } from "./parser.js";
export function collectDslqlReferences(expression) {
    const ast = typeof expression === "string"
        ? parseDslqlExpression(expression)
        : expression;
    const references = [];
    visitDslqlAst(ast, (node) => {
        if (node.kind === "reference") {
            references.push({ id: node.id, range: node.range });
        }
    });
    return references;
}
export function collectDslqlReferenceIds(expression) {
    return [
        ...new Set(collectDslqlReferences(expression).map((reference) => reference.id)),
    ];
}
//# sourceMappingURL=references.js.map