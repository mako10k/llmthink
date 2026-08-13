function childNodes(node) {
    switch (node.kind) {
        case "array":
            return node.elements;
        case "binary":
            return [node.left, node.right];
        case "call":
            return node.arguments;
        case "field":
            return [node.value];
        case "object":
            return node.fields;
        case "path":
            return node.segments;
        case "pipe":
            return node.stages;
        case "unary":
            return [node.operand];
        default:
            return [];
    }
}
export function visitDslqlAst(expression, visitor) {
    function visit(node, parent) {
        visitor(node, parent);
        for (const child of childNodes(node)) {
            visit(child, node);
        }
    }
    visit(expression);
}
const EXPRESSION_KINDS = new Set([
    "array",
    "binary",
    "call",
    "literal",
    "object",
    "path",
    "pipe",
    "reference",
    "unary",
]);
function expectExpression(node) {
    if (!EXPRESSION_KINDS.has(node.kind)) {
        throw new TypeError(`Expected expression node, received '${node.kind}'`);
    }
    return node;
}
function expectField(node) {
    if (node.kind !== "field") {
        throw new TypeError(`Expected object field node, received '${node.kind}'`);
    }
    return node;
}
function expectPathSegment(node) {
    if (!["property", "index", "iterate"].includes(node.kind)) {
        throw new TypeError(`Expected path segment node, received '${node.kind}'`);
    }
    return node;
}
function transformChildren(node, transform) {
    switch (node.kind) {
        case "array":
            return {
                ...node,
                elements: node.elements.map((child) => expectExpression(transform(child))),
            };
        case "binary":
            return {
                ...node,
                left: expectExpression(transform(node.left)),
                right: expectExpression(transform(node.right)),
            };
        case "call":
            return {
                ...node,
                arguments: node.arguments.map((child) => expectExpression(transform(child))),
            };
        case "field":
            return {
                ...node,
                value: expectExpression(transform(node.value)),
            };
        case "object":
            return {
                ...node,
                fields: node.fields.map((field) => expectField(transform(field))),
            };
        case "path":
            return {
                ...node,
                segments: node.segments.map((segment) => expectPathSegment(transform(segment))),
            };
        case "pipe":
            return {
                ...node,
                stages: node.stages.map((child) => expectExpression(transform(child))),
            };
        case "unary":
            return { ...node, operand: expectExpression(transform(node.operand)) };
        default:
            return node;
    }
}
export function transformDslqlAst(expression, transformer) {
    function transform(node) {
        const transformedChildren = transformChildren(node, transform);
        return transformer(transformedChildren) ?? transformedChildren;
    }
    return expectExpression(transform(expression));
}
//# sourceMappingURL=ast.js.map