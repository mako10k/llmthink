import {
  type DslqlBinaryExpression,
  type DslqlCallExpression,
  type DslqlComparisonOperator,
  type DslqlExpression,
  type DslqlPathExpression,
  type DslqlPathSegment,
  type DslqlSourceRange,
  validateDslqlAst,
} from "./ast.js";
import { parseDslqlExpression } from "./parser.js";
import {
  acceptsDslqlFunctionArity,
  assertDslqlFunctionImplementationCoverage,
  formatDslqlFunctionArity,
  getDslqlFunctionSpec,
} from "./functions.js";

export type DslqlValue =
  | string
  | number
  | boolean
  | null
  | DslqlValue[]
  | { [key: string]: DslqlValue };

export type DslqlObject = { [key: string]: DslqlValue };

export interface DslqlFunctionContext {
  input: readonly DslqlValue[];
  arguments: readonly DslqlExpression[];
  runtime: DslqlRuntime;
  evaluate: (
    expression: DslqlExpression,
    input?: readonly DslqlValue[],
  ) => DslqlValue[];
}

export type DslqlFunction = (
  context: DslqlFunctionContext,
) => readonly DslqlValue[];

export interface DslqlRuntime {
  root: DslqlValue;
  functions?: Readonly<Record<string, DslqlFunction>>;
}

export class DslqlEvaluationError extends Error {
  constructor(
    message: string,
    readonly range?: DslqlSourceRange,
  ) {
    super(message);
    this.name = "DslqlEvaluationError";
  }
}

interface EvaluationContext {
  runtime: DslqlRuntime;
}

function isObject(value: DslqlValue): value is DslqlObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valueKind(value: DslqlValue): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function truthy(values: readonly DslqlValue[]): boolean {
  if (values.length === 0) return false;
  return values.some((value) => value !== false && value !== null);
}

function conditionTruth(
  values: readonly DslqlValue[],
  expression: DslqlExpression,
  label: string,
): boolean {
  if (values.length > 1) {
    throw new DslqlEvaluationError(
      `${label} must produce at most one value; received ${values.length}`,
      expression.range,
    );
  }
  return truthy(values);
}

function stableStringify(value: DslqlValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key]!)}`)
    .join(",")}}`;
}

function equalValues(left: DslqlValue, right: DslqlValue): boolean {
  return stableStringify(left) === stableStringify(right);
}

function requiredSingleton(
  values: readonly DslqlValue[],
  label: string,
  expression: DslqlExpression,
): DslqlValue {
  if (values.length !== 1) {
    throw new DslqlEvaluationError(
      `${label} must produce exactly one value; received ${values.length}`,
      expression.range,
    );
  }
  return values[0] as DslqlValue;
}

function optionalSingleton(
  values: readonly DslqlValue[],
  label: string,
  expression: DslqlExpression,
): DslqlValue | undefined {
  if (values.length > 1) {
    throw new DslqlEvaluationError(
      `${label} must produce at most one value; received ${values.length}`,
      expression.range,
    );
  }
  return values[0];
}

function pathFailure(message: string, segment: DslqlPathSegment): never {
  throw new DslqlEvaluationError(message, segment.range);
}

function evaluateProperty(
  input: readonly DslqlValue[],
  segment: Extract<DslqlPathSegment, { kind: "property" }>,
): DslqlValue[] {
  const output: DslqlValue[] = [];
  for (const value of input) {
    if (!isObject(value)) {
      if (segment.optional) continue;
      pathFailure(
        `Cannot access property '${segment.key}' on ${valueKind(value)}`,
        segment,
      );
    }
    if (!Object.prototype.hasOwnProperty.call(value, segment.key)) {
      if (segment.optional) continue;
      pathFailure(`Required property '${segment.key}' is missing`, segment);
    }
    output.push(value[segment.key] as DslqlValue);
  }
  return output;
}

function evaluateIndex(
  input: readonly DslqlValue[],
  segment: Extract<DslqlPathSegment, { kind: "index" }>,
): DslqlValue[] {
  const output: DslqlValue[] = [];
  for (const value of input) {
    if (!Array.isArray(value)) {
      if (segment.optional) continue;
      pathFailure(`Cannot index ${valueKind(value)}`, segment);
    }
    if (segment.index >= value.length) {
      if (segment.optional) continue;
      pathFailure(`Array index ${segment.index} is out of bounds`, segment);
    }
    output.push(value[segment.index] as DslqlValue);
  }
  return output;
}

function evaluateIteration(
  input: readonly DslqlValue[],
  segment: Extract<DslqlPathSegment, { kind: "iterate" }>,
): DslqlValue[] {
  const output: DslqlValue[] = [];
  for (const value of input) {
    if (!Array.isArray(value)) {
      if (segment.optional) continue;
      pathFailure(`Cannot iterate over ${valueKind(value)}`, segment);
    }
    output.push(...value);
  }
  return output;
}

function evaluatePath(
  expression: DslqlPathExpression,
  input: readonly DslqlValue[],
  context: EvaluationContext,
): DslqlValue[] {
  let stream =
    expression.origin === "root" ? [context.runtime.root] : [...input];
  for (const segment of expression.segments) {
    switch (segment.kind) {
      case "property":
        stream = evaluateProperty(stream, segment);
        break;
      case "index":
        stream = evaluateIndex(stream, segment);
        break;
      case "iterate":
        stream = evaluateIteration(stream, segment);
        break;
    }
  }
  return stream;
}

function compareOrdered(
  left: DslqlValue,
  right: DslqlValue,
  operator: Exclude<DslqlComparisonOperator, "==" | "!=" | "in">,
  expression: DslqlExpression,
): boolean {
  const sameComparableType =
    (typeof left === "number" && typeof right === "number") ||
    (typeof left === "string" && typeof right === "string");
  if (!sameComparableType) {
    throw new DslqlEvaluationError(
      `Operator '${operator}' requires two numbers or two strings of the same type`,
      expression.range,
    );
  }
  if (operator === ">") return left > right;
  if (operator === ">=") return left >= right;
  if (operator === "<") return left < right;
  return left <= right;
}

function compareValues(
  left: DslqlValue,
  right: DslqlValue,
  operator: DslqlComparisonOperator,
  expression: DslqlExpression,
): boolean {
  if (operator === "==") return equalValues(left, right);
  if (operator === "!=") return !equalValues(left, right);
  if (operator === "in") {
    if (!Array.isArray(right)) {
      throw new DslqlEvaluationError(
        "Right operand of 'in' must be an array",
        expression.range,
      );
    }
    return right.some((candidate) => equalValues(left, candidate));
  }
  return compareOrdered(left, right, operator, expression);
}

function evaluateBinaryItem(
  expression: DslqlBinaryExpression,
  item: DslqlValue,
  context: EvaluationContext,
): boolean {
  const leftValues = evaluateExpression(expression.left, [item], context);
  if (expression.operator === "and") {
    return (
      conditionTruth(leftValues, expression.left, "Left logical operand") &&
      conditionTruth(
        evaluateExpression(expression.right, [item], context),
        expression.right,
        "Right logical operand",
      )
    );
  }
  if (expression.operator === "or") {
    return (
      conditionTruth(leftValues, expression.left, "Left logical operand") ||
      conditionTruth(
        evaluateExpression(expression.right, [item], context),
        expression.right,
        "Right logical operand",
      )
    );
  }
  const rightValues = evaluateExpression(expression.right, [item], context);
  const left = optionalSingleton(
    leftValues,
    "Left comparison operand",
    expression.left,
  );
  const right = optionalSingleton(
    rightValues,
    "Right comparison operand",
    expression.right,
  );
  if (left === undefined || right === undefined) {
    return false;
  }
  return compareValues(left, right, expression.operator, expression);
}

function evaluateObject(
  expression: Extract<DslqlExpression, { kind: "object" }>,
  input: readonly DslqlValue[],
  context: EvaluationContext,
): DslqlValue[] {
  return input.map((item) => {
    const output: DslqlObject = {};
    for (const field of expression.fields) {
      const values = evaluateExpression(field.value, [item], context);
      const value = optionalSingleton(
        values,
        `Object field '${field.key}'`,
        field.value,
      );
      if (value !== undefined) {
        output[field.key] = value;
      }
    }
    return output;
  });
}

function validateFunctionArity(expression: DslqlCallExpression): void {
  const functionSpec = getDslqlFunctionSpec(expression.name);
  if (
    functionSpec &&
    !acceptsDslqlFunctionArity(functionSpec, expression.arguments.length)
  ) {
    const expected =
      functionSpec.arity.maximum === 0
        ? "no arguments"
        : `${formatDslqlFunctionArity(functionSpec)} argument(s)`;
    throw new DslqlEvaluationError(
      `${expression.name}() expects ${expected}; received ${expression.arguments.length}`,
      expression.range,
    );
  }
}

function evaluatePerItem(
  expression: DslqlExpression,
  input: readonly DslqlValue[],
  context: EvaluationContext,
): DslqlValue[] {
  return input.flatMap((item) =>
    evaluateExpression(expression, [item], context),
  );
}

function evaluateSelector(
  selector: DslqlExpression,
  item: DslqlValue,
  context: EvaluationContext,
  label: string,
): DslqlValue {
  return requiredSingleton(
    evaluateExpression(selector, [item], context),
    label,
    selector,
  );
}

function sortableValue(
  value: DslqlValue,
  expression: DslqlExpression,
): string | number {
  if (typeof value === "string" || typeof value === "number") {
    return value;
  }
  throw new DslqlEvaluationError(
    "sort_by() keys must all be strings or numbers",
    expression.range,
  );
}

function evaluateSortBy(
  expression: DslqlCallExpression,
  input: readonly DslqlValue[],
  context: EvaluationContext,
): DslqlValue[] {
  const selector = expression.arguments[0]!;
  const decorated = input.map((value, position) => ({
    value,
    position,
    key: sortableValue(
      evaluateSelector(selector, value, context, "sort_by() selector"),
      selector,
    ),
  }));
  const kinds = new Set(decorated.map((item) => typeof item.key));
  if (kinds.size > 1) {
    throw new DslqlEvaluationError(
      "sort_by() keys must have one consistent type",
      selector.range,
    );
  }
  return decorated
    .sort((left, right) => {
      if (left.key < right.key) return -1;
      if (left.key > right.key) return 1;
      return left.position - right.position;
    })
    .map((item) => item.value);
}

function evaluateUniqueBy(
  expression: DslqlCallExpression,
  input: readonly DslqlValue[],
  context: EvaluationContext,
): DslqlValue[] {
  const selector = expression.arguments[0];
  const seen = new Set<string>();
  return input.filter((item) => {
    const key = selector
      ? evaluateSelector(selector, item, context, "unique_by() selector")
      : item;
    const encoded = stableStringify(key);
    if (seen.has(encoded)) return false;
    seen.add(encoded);
    return true;
  });
}

function evaluateLimit(
  expression: DslqlCallExpression,
  input: readonly DslqlValue[],
  context: EvaluationContext,
): DslqlValue[] {
  const argument = expression.arguments[0]!;
  const scope =
    input.length > 0 ? [input[0] as DslqlValue] : [context.runtime.root];
  const value = requiredSingleton(
    evaluateExpression(argument, scope, context),
    "limit() argument",
    argument,
  );
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new DslqlEvaluationError(
      "limit() requires a non-negative safe integer",
      argument.range,
    );
  }
  return input.slice(0, Number(value));
}

function lengthOf(value: DslqlValue, expression: DslqlExpression): number {
  if (typeof value === "string" || Array.isArray(value)) return value.length;
  if (isObject(value)) return Object.keys(value).length;
  if (value === null) return 0;
  throw new DslqlEvaluationError(
    `len() does not accept ${valueKind(value)}`,
    expression.range,
  );
}

function evaluateScalarFunction(
  expression: DslqlCallExpression,
  input: readonly DslqlValue[],
  context: EvaluationContext,
  operation: (value: DslqlValue, argument?: DslqlValue) => DslqlValue,
): DslqlValue[] {
  const argument = expression.arguments[0];
  return input.map((item) => {
    const value = argument
      ? requiredSingleton(
          evaluateExpression(argument, [item], context),
          `${expression.name}() argument`,
          argument,
        )
      : undefined;
    return operation(item, value);
  });
}

function evaluateContains(
  value: DslqlValue,
  needle: DslqlValue | undefined,
  expression: DslqlExpression,
): boolean {
  if (typeof value === "string" && typeof needle === "string") {
    return value.includes(needle);
  }
  if (Array.isArray(value) && needle !== undefined) {
    return value.some((candidate) => equalValues(candidate, needle));
  }
  throw new DslqlEvaluationError(
    "contains() requires string/string or array/value operands",
    expression.range,
  );
}

function evaluateStringBoundary(
  value: DslqlValue,
  boundary: DslqlValue | undefined,
  expression: DslqlExpression,
  operation: (text: string, expected: string) => boolean,
): boolean {
  if (typeof value !== "string" || typeof boundary !== "string") {
    throw new DslqlEvaluationError(
      `${(expression as DslqlCallExpression).name}() requires string operands`,
      expression.range,
    );
  }
  return operation(value, boundary);
}

type BuiltinEvaluator = (
  expression: DslqlCallExpression,
  input: readonly DslqlValue[],
  context: EvaluationContext,
) => DslqlValue[];

const BUILTIN_EVALUATORS: Readonly<Record<string, BuiltinEvaluator>> = {
  select: (expression, input, context) => {
    const condition = expression.arguments[0]!;
    return input.filter((item) =>
      conditionTruth(
        evaluateExpression(condition, [item], context),
        condition,
        "select() predicate",
      ),
    );
  },
  map: (expression, input, context) =>
    evaluatePerItem(expression.arguments[0]!, input, context),
  sort_by: evaluateSortBy,
  unique_by: evaluateUniqueBy,
  limit: evaluateLimit,
  len: (expression, input, context) =>
    evaluateScalarFunction(expression, input, context, (item, argument) =>
      lengthOf(argument ?? item, expression),
    ),
  contains: (expression, input, context) =>
    evaluateScalarFunction(expression, input, context, (item, argument) =>
      evaluateContains(item, argument, expression),
    ),
  starts_with: (expression, input, context) =>
    evaluateScalarFunction(expression, input, context, (item, argument) =>
      evaluateStringBoundary(item, argument, expression, (text, prefix) =>
        text.startsWith(prefix),
      ),
    ),
  ends_with: (expression, input, context) =>
    evaluateScalarFunction(expression, input, context, (item, argument) =>
      evaluateStringBoundary(item, argument, expression, (text, suffix) =>
        text.endsWith(suffix),
      ),
    ),
  kind: (expression, input, context) =>
    evaluateScalarFunction(expression, input, context, (item) =>
      valueKind(item),
    ),
};

export const DSLQL_BUILTIN_FUNCTION_NAMES = Object.freeze(
  Object.keys(BUILTIN_EVALUATORS),
);
assertDslqlFunctionImplementationCoverage(
  ["core"],
  DSLQL_BUILTIN_FUNCTION_NAMES,
);

function evaluateBuiltin(
  expression: DslqlCallExpression,
  input: readonly DslqlValue[],
  context: EvaluationContext,
): DslqlValue[] | undefined {
  return BUILTIN_EVALUATORS[expression.name]?.(expression, input, context);
}

function evaluateCall(
  expression: DslqlCallExpression,
  input: readonly DslqlValue[],
  context: EvaluationContext,
): DslqlValue[] {
  validateFunctionArity(expression);
  const builtin = evaluateBuiltin(expression, input, context);
  if (builtin !== undefined) return builtin;
  const fn = context.runtime.functions?.[expression.name];
  if (!fn) {
    throw new DslqlEvaluationError(
      `Unknown function '${expression.name}'`,
      expression.range,
    );
  }
  return [
    ...fn({
      input,
      arguments: expression.arguments,
      runtime: context.runtime,
      evaluate: (candidate, candidateInput = input) =>
        evaluateExpression(candidate, candidateInput, context),
    }),
  ];
}

function evaluateExpression(
  expression: DslqlExpression,
  input: readonly DslqlValue[],
  context: EvaluationContext,
): DslqlValue[] {
  switch (expression.kind) {
    case "literal":
      return input.map(() => expression.value);
    case "reference":
      return input.map(() => expression.id);
    case "path":
      return evaluatePath(expression, input, context);
    case "array":
      return [
        expression.elements.flatMap((element) =>
          evaluateExpression(element, input, context),
        ),
      ];
    case "object":
      return evaluateObject(expression, input, context);
    case "unary":
      return input.map(
        (item) =>
          !conditionTruth(
            evaluateExpression(expression.operand, [item], context),
            expression.operand,
            "not operand",
          ),
      );
    case "binary":
      return input.map((item) => evaluateBinaryItem(expression, item, context));
    case "call":
      return evaluateCall(expression, input, context);
    case "pipe": {
      let stream = [...input];
      for (const stage of expression.stages) {
        stream = evaluateExpression(stage, stream, context);
      }
      return stream;
    }
  }
}

export function evaluateDslqlExpression(
  expression: string | DslqlExpression,
  runtime: DslqlRuntime,
): DslqlValue[] {
  const ast =
    typeof expression === "string"
      ? parseDslqlExpression(expression)
      : expression;
  validateDslqlAst(ast);
  return evaluateExpression(ast, [runtime.root], { runtime });
}
