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

export type DslqlPathSegment =
  | DslqlPropertySegment
  | DslqlIndexSegment
  | DslqlIterateSegment;

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

export type DslqlComparisonOperator =
  | "=="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "in";

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

export type DslqlExpression =
  | DslqlArrayExpression
  | DslqlBinaryExpression
  | DslqlCallExpression
  | DslqlLiteralExpression
  | DslqlObjectExpression
  | DslqlPathExpression
  | DslqlPipeExpression
  | DslqlReferenceExpression
  | DslqlUnaryExpression;

export type DslqlAstNode =
  | DslqlExpression
  | DslqlObjectField
  | DslqlPathSegment;

export type DslqlVisitor = (
  node: DslqlAstNode,
  parent: DslqlAstNode | undefined,
) => void;

function childNodes(node: DslqlAstNode): DslqlAstNode[] {
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

export function visitDslqlAst(
  expression: DslqlExpression,
  visitor: DslqlVisitor,
): void {
  function visit(node: DslqlAstNode, parent?: DslqlAstNode): void {
    visitor(node, parent);
    for (const child of childNodes(node)) {
      visit(child, node);
    }
  }
  visit(expression);
}

export type DslqlTransformer = (node: DslqlAstNode) => DslqlAstNode | undefined;

const EXPRESSION_KINDS = new Set<DslqlExpression["kind"]>([
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

function expectExpression(node: DslqlAstNode): DslqlExpression {
  if (!EXPRESSION_KINDS.has(node.kind as DslqlExpression["kind"])) {
    throw new TypeError(`Expected expression node, received '${node.kind}'`);
  }
  return node as DslqlExpression;
}

function expectField(node: DslqlAstNode): DslqlObjectField {
  if (node.kind !== "field") {
    throw new TypeError(`Expected object field node, received '${node.kind}'`);
  }
  return node;
}

function expectPathSegment(node: DslqlAstNode): DslqlPathSegment {
  if (!["property", "index", "iterate"].includes(node.kind)) {
    throw new TypeError(`Expected path segment node, received '${node.kind}'`);
  }
  return node as DslqlPathSegment;
}

function transformChildren(
  node: DslqlAstNode,
  transform: (child: DslqlAstNode) => DslqlAstNode,
): DslqlAstNode {
  switch (node.kind) {
    case "array":
      return {
        ...node,
        elements: node.elements.map((child) =>
          expectExpression(transform(child)),
        ),
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
        arguments: node.arguments.map((child) =>
          expectExpression(transform(child)),
        ),
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
        segments: node.segments.map((segment) =>
          expectPathSegment(transform(segment)),
        ),
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

export function transformDslqlAst(
  expression: DslqlExpression,
  transformer: DslqlTransformer,
): DslqlExpression {
  function transform(node: DslqlAstNode): DslqlAstNode {
    const transformedChildren = transformChildren(node, transform);
    return transformer(transformedChildren) ?? transformedChildren;
  }
  return expectExpression(transform(expression));
}
