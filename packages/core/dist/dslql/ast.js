const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const EXPRESSION_KIND_VALUES = [
    "array",
    "binary",
    "call",
    "literal",
    "object",
    "path",
    "pipe",
    "reference",
    "unary",
];
const EXPRESSION_KIND_SET = new Set(EXPRESSION_KIND_VALUES);
const PATH_SEGMENT_KIND_SET = new Set(["property", "index", "iterate"]);
const BINARY_OPERATOR_SET = new Set([
    "==",
    "!=",
    ">",
    ">=",
    "<",
    "<=",
    "in",
    "and",
    "or",
]);
export class DslqlAstValidationError extends TypeError {
    range;
    constructor(message, range) {
        super(message);
        this.range = range;
        this.name = "DslqlAstValidationError";
    }
}
function validationError(message, node) {
    throw new DslqlAstValidationError(message, node?.range);
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validatePosition(value, label) {
    if (!isRecord(value))
        validationError(`${label} must be an object`);
    for (const field of ["offset", "line", "column"]) {
        if (!Number.isSafeInteger(value[field])) {
            validationError(`${label}.${field} must be a safe integer`);
        }
    }
    if (Number(value.offset) < 0 ||
        Number(value.line) < 1 ||
        Number(value.column) < 1) {
        validationError(`${label} contains an out-of-range position`);
    }
}
function validateRange(value) {
    if (!isRecord(value))
        validationError("AST node range must be an object");
    validatePosition(value.start, "range.start");
    validatePosition(value.end, "range.end");
    if (value.start.offset > value.end.offset ||
        value.start.line > value.end.line ||
        (value.start.line === value.end.line &&
            value.start.column > value.end.column)) {
        validationError("AST node range start must not follow its end");
    }
}
function validateNodeRange(node) {
    validateRange(node.range);
}
function requireString(value, label, node) {
    if (typeof value !== "string")
        validationError(`${label} must be a string`, node);
}
function requireIdentifier(value, label, node) {
    requireString(value, label, node);
    if (!IDENTIFIER_PATTERN.test(value)) {
        validationError(`${label} must be a valid identifier`, node);
    }
}
function requireBoolean(value, label, node) {
    if (typeof value !== "boolean")
        validationError(`${label} must be boolean`, node);
}
function requireArray(value, label, node) {
    if (!Array.isArray(value))
        validationError(`${label} must be an array`, node);
}
function validateLiteralValue(value, node) {
    if (value !== null &&
        typeof value !== "string" &&
        typeof value !== "boolean" &&
        typeof value !== "number") {
        validationError("literal.value must be a DSLQL literal", node);
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
        validationError("Number literal must be finite", node);
    }
}
function validateChildRange(parent, child) {
    const parentRange = parent.range;
    const childRange = child.range;
    if (childRange.start.offset < parentRange.start.offset ||
        childRange.end.offset > parentRange.end.offset) {
        validationError("Child AST node range must be contained by its parent", child);
    }
}
function validatePathSegmentShape(node) {
    requireBoolean(node.optional, `${String(node.kind)}.optional`, node);
    if (node.kind === "property") {
        requireString(node.key, "property.key", node);
    }
    else if (node.kind === "index") {
        if (!Number.isSafeInteger(node.index) || Number(node.index) < 0) {
            validationError("index.index must be a non-negative safe integer", node);
        }
    }
}
function validatePathShape(node) {
    if (node.origin !== "current" && node.origin !== "root") {
        validationError("path.origin must be 'current' or 'root'", node);
    }
    requireArray(node.segments, "path.segments", node);
    return node.segments;
}
function validateCallShape(node) {
    requireIdentifier(node.name, "call.name", node);
    requireArray(node.arguments, "call.arguments", node);
    return node.arguments;
}
function validateObjectShape(node) {
    requireArray(node.fields, "object.fields", node);
    const keys = new Set();
    for (const field of node.fields) {
        if (!isRecord(field) || typeof field.key !== "string")
            continue;
        if (keys.has(field.key)) {
            validationError(`Duplicate object field '${field.key}'`, field);
        }
        keys.add(field.key);
    }
    return node.fields;
}
function validateUnaryShape(node) {
    if (node.operator !== "not")
        validationError("Unknown unary operator", node);
    return [node.operand];
}
function validateBinaryShape(node) {
    if (!BINARY_OPERATOR_SET.has(node.operator)) {
        validationError("Unknown binary operator", node);
    }
    return [node.left, node.right];
}
function validatePipeShape(node) {
    requireArray(node.stages, "pipe.stages", node);
    if (node.stages.length < 2) {
        validationError("pipe.stages must contain at least two expressions", node);
    }
    return node.stages;
}
function validateExpressionShape(node) {
    switch (node.kind) {
        case "literal":
            validateLiteralValue(node.value, node);
            return [];
        case "reference":
            requireIdentifier(node.id, "reference.id", node);
            return [];
        case "path":
            return validatePathShape(node);
        case "call":
            return validateCallShape(node);
        case "object":
            return validateObjectShape(node);
        case "array":
            requireArray(node.elements, "array.elements", node);
            return node.elements;
        case "unary":
            return validateUnaryShape(node);
        case "binary":
            return validateBinaryShape(node);
        case "pipe":
            return validatePipeShape(node);
        default:
            validationError(`Unknown AST node kind '${String(node.kind)}'`, node);
    }
}
function expectedChildCategory(parent) {
    if (parent.kind === "object")
        return "field";
    if (parent.kind === "path")
        return "segment";
    return "expression";
}
function validateChildCategory(child, expected) {
    let valid = PATH_SEGMENT_KIND_SET.has(String(child.kind));
    if (expected === "expression") {
        valid = EXPRESSION_KIND_SET.has(String(child.kind));
    }
    else if (expected === "field") {
        valid = child.kind === "field";
    }
    if (!valid) {
        validationError(`Expected ${expected} AST node, received '${String(child.kind)}'`, child);
    }
}
export function validateDslqlAst(expression) {
    const visiting = new WeakSet();
    const validated = new WeakSet();
    function validateNode(value, parent) {
        if (!isRecord(value))
            validationError("AST node must be an object");
        validateNodeRange(value);
        if (parent) {
            validateChildCategory(value, expectedChildCategory(parent));
            validateChildRange(parent, value);
        }
        else if (!EXPRESSION_KIND_SET.has(String(value.kind))) {
            validationError("AST root must be an expression", value);
        }
        if (visiting.has(value))
            validationError("AST must not contain a cycle", value);
        if (validated.has(value))
            return;
        visiting.add(value);
        if (PATH_SEGMENT_KIND_SET.has(String(value.kind))) {
            validatePathSegmentShape(value);
            visiting.delete(value);
            validated.add(value);
            return;
        }
        if (value.kind === "field") {
            requireString(value.key, "field.key", value);
            validateNode(value.value, value);
            visiting.delete(value);
            validated.add(value);
            return;
        }
        for (const child of validateExpressionShape(value)) {
            validateNode(child, value);
        }
        visiting.delete(value);
        validated.add(value);
    }
    validateNode(expression);
}
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
    validateDslqlAst(expression);
    function visit(node, parent) {
        visitor(node, parent);
        for (const child of childNodes(node)) {
            visit(child, node);
        }
    }
    visit(expression);
}
const EXPRESSION_KINDS = new Set(EXPRESSION_KIND_VALUES);
function expectExpression(node) {
    if (!EXPRESSION_KINDS.has(node.kind)) {
        throw new DslqlAstValidationError(`Expected expression node, received '${node.kind}'`, node.range);
    }
    return node;
}
function expectField(node) {
    if (node.kind !== "field") {
        throw new DslqlAstValidationError(`Expected object field node, received '${node.kind}'`, node.range);
    }
    return node;
}
function expectPathSegment(node) {
    if (!["property", "index", "iterate"].includes(node.kind)) {
        throw new DslqlAstValidationError(`Expected path segment node, received '${node.kind}'`, node.range);
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
    validateDslqlAst(expression);
    function transform(node) {
        const transformedChildren = transformChildren(node, transform);
        return transformer(transformedChildren) ?? transformedChildren;
    }
    const transformed = expectExpression(transform(expression));
    validateDslqlAst(transformed);
    return transformed;
}
//# sourceMappingURL=ast.js.map