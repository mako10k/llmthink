import {
  type DslqlExpression,
  type DslqlSourceRange,
  visitDslqlAst,
} from "./ast.js";
import { parseDslqlExpression } from "./parser.js";

export interface DslqlReference {
  id: string;
  range: DslqlSourceRange;
}

export function collectDslqlReferences(
  expression: string | DslqlExpression,
): DslqlReference[] {
  const ast =
    typeof expression === "string"
      ? parseDslqlExpression(expression)
      : expression;
  const references: DslqlReference[] = [];
  visitDslqlAst(ast, (node) => {
    if (node.kind === "reference") {
      references.push({ id: node.id, range: node.range });
    }
  });
  return references;
}

export function collectDslqlReferenceIds(
  expression: string | DslqlExpression,
): string[] {
  return [
    ...new Set(
      collectDslqlReferences(expression).map((reference) => reference.id),
    ),
  ];
}
