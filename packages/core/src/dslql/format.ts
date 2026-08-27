import {
  type DslqlBinaryExpression,
  type DslqlExpression,
  type DslqlPathSegment,
  validateDslqlAst,
} from "./ast.js";

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;

function precedence(expression: DslqlExpression): number {
  if (expression.kind === "pipe") return 1;
  if (expression.kind === "binary") {
    if (expression.operator === "or") return 2;
    if (expression.operator === "and") return 3;
    return 4;
  }
  if (expression.kind === "unary") return 5;
  return 6;
}

function formatPathSegment(segment: DslqlPathSegment): string {
  const optional = segment.optional ? "?" : "";
  if (segment.kind === "iterate") return `[]${optional}`;
  if (segment.kind === "index") return `[${segment.index}]${optional}`;
  if (IDENTIFIER_PATTERN.test(segment.key)) {
    return `.${segment.key}${optional}`;
  }
  return `[${JSON.stringify(segment.key)}]${optional}`;
}

function objectKey(key: string): string {
  return IDENTIFIER_PATTERN.test(key) ? key : JSON.stringify(key);
}

function needsSamePrecedenceParentheses(
  expression: DslqlExpression,
  parent: DslqlExpression,
  side: "left" | "right" | undefined,
): boolean {
  if (expression.kind !== "binary" || parent.kind !== "binary") {
    return false;
  }
  const parentIsComparison = !["and", "or"].includes(parent.operator);
  if (parentIsComparison) return true;
  return side === "right" && expression.operator !== parent.operator;
}

function formatChild(
  expression: DslqlExpression,
  parent: DslqlExpression,
  side?: "left" | "right",
): string {
  const formatted = formatExpression(expression);
  if (
    precedence(expression) < precedence(parent) ||
    (precedence(expression) === precedence(parent) &&
      needsSamePrecedenceParentheses(expression, parent, side))
  ) {
    return `(${formatted})`;
  }
  return formatted;
}

function formatBinary(expression: DslqlBinaryExpression): string {
  return `${formatChild(expression.left, expression, "left")} ${expression.operator} ${formatChild(
    expression.right,
    expression,
    "right",
  )}`;
}

function formatExpression(expression: DslqlExpression): string {
  switch (expression.kind) {
    case "literal":
      return JSON.stringify(expression.value);
    case "reference":
      return `@${expression.id}`;
    case "path":
      return formatPath(expression.origin, expression.segments);
    case "array":
      return `[${expression.elements.map(formatExpression).join(", ")}]`;
    case "object":
      return `{${expression.fields
        .map(
          (field) =>
            `${objectKey(field.key)}: ${formatExpression(field.value)}`,
        )
        .join(", ")}}`;
    case "call":
      return `${expression.name}(${expression.arguments.map(formatExpression).join(", ")})`;
    case "unary":
      return `not ${formatChild(expression.operand, expression)}`;
    case "binary":
      return formatBinary(expression);
    case "pipe":
      return expression.stages
        .map((stage) => formatChild(stage, expression))
        .join(" | ");
  }
}

function formatPath(
  origin: "current" | "root",
  segments: DslqlPathSegment[],
): string {
  const formatted = segments.map(formatPathSegment);
  if (
    origin === "current" &&
    segments[0]?.kind === "property" &&
    IDENTIFIER_PATTERN.test(segments[0].key)
  ) {
    formatted[0] = formatted[0]?.slice(1) ?? "";
  }
  return `${origin === "root" ? "$" : "."}${formatted.join("")}`;
}

export function formatDslqlExpression(expression: DslqlExpression): string {
  validateDslqlAst(expression);
  return formatExpression(expression);
}
