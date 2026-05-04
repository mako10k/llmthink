type DslqlLiteral = string | number | boolean | null;

export type DslqlValue =
  | DslqlLiteral
  | DslqlValue[]
  | { [key: string]: DslqlValue | undefined };

export interface DslqlRuntime {
  root: DslqlValue;
  functions?: Record<string, (input: DslqlValue[], args: DslqlValue[], runtime: DslqlRuntime) => DslqlValue[]>;
}

type DslqlObject = { [key: string]: DslqlValue | undefined };

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
  fields: Array<{ key: string; value: DslqlExpression }>;
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

export type DslqlExpression =
  | ArrayCollectExpression
  | BinaryExpression
  | CallExpression
  | LiteralExpression
  | ObjectExpression
  | PathExpression
  | PipeExpression
  | UnaryExpression;

export class DslqlParseError extends Error {
  constructor(
    message: string,
    readonly column: number,
    readonly endColumn = column,
  ) {
    super(message);
  }
}

interface EvaluationContext {
  runtime: DslqlRuntime;
  inputStream: DslqlValue[];
}

class Parser {
  private index = 0;

  constructor(private readonly input: string) {}

  parse(): DslqlExpression {
    const expression = this.parsePipe();
    this.skipWhitespace();
    if (!this.isAtEnd()) {
      throw this.error("Unexpected token");
    }
    return expression;
  }

  private parsePipe(): DslqlExpression {
    const stages = [this.parseOr()];
    this.skipWhitespace();
    while (this.peek() === "|") {
      this.index += 1;
      stages.push(this.parseOr());
      this.skipWhitespace();
    }
    return stages.length === 1 ? stages[0] : { type: "pipe", stages };
  }

  private parseOr(): DslqlExpression {
    let expression = this.parseAnd();
    while (this.consumeKeyword("or")) {
      expression = {
        type: "binary",
        operator: "or",
        left: expression,
        right: this.parseAnd(),
      };
    }
    return expression;
  }

  private parseAnd(): DslqlExpression {
    let expression = this.parseComparison();
    while (this.consumeKeyword("and")) {
      expression = {
        type: "binary",
        operator: "and",
        left: expression,
        right: this.parseComparison(),
      };
    }
    return expression;
  }

  private parseComparison(): DslqlExpression {
    let expression = this.parseUnary();
    while (true) {
      const operator = this.consumeOperator();
      if (!operator) {
        return expression;
      }
      expression = {
        type: "binary",
        operator,
        left: expression,
        right: this.parseUnary(),
      };
    }
  }

  private parseUnary(): DslqlExpression {
    if (this.consumeKeyword("not")) {
      return {
        type: "unary",
        operator: "not",
        operand: this.parseUnary(),
      };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): DslqlExpression {
    this.skipWhitespace();

    if (this.peek() === ".") {
      return this.parsePath();
    }
    if (this.peek() === '"') {
      return { type: "literal", value: this.parseString() };
    }
    if (this.peek() === "{") {
      return this.parseObject();
    }
    if (this.peek() === "[") {
      return this.parseCollect();
    }
    if (this.peek() === "(") {
      this.index += 1;
      const expression = this.parsePipe();
      this.expect(")");
      return expression;
    }

    const identifier = this.tryParseIdentifier();
    if (identifier) {
      if (identifier === "true") {
        return { type: "literal", value: true };
      }
      if (identifier === "false") {
        return { type: "literal", value: false };
      }
      if (identifier === "null") {
        return { type: "literal", value: null };
      }
      if (this.peek() === "(") {
        return this.parseCall(identifier);
      }
      return { type: "call", name: identifier, args: [] };
    }

    const number = this.tryParseNumber();
    if (number !== undefined) {
      return { type: "literal", value: number };
    }

    throw this.error("Expected expression");
  }

  private parsePath(): PathExpression {
    this.expect(".");
    const segments: PathSegment[] = [];

    while (!this.isAtEnd()) {
      this.skipWhitespace();
      if (this.peek() === "." || /[A-Za-z_]/.test(this.peek() ?? "")) {
        if (this.peek() === ".") {
          this.index += 1;
        }
        const name = this.parseIdentifier("Expected field name");
        let optional = false;
        if (this.peek() === "?") {
          optional = true;
          this.index += 1;
        }
        segments.push({ type: "field", name, optional });
        continue;
      }
      if (this.peek() === "[") {
        this.expect("[");
        this.expect("]");
        segments.push({ type: "iterate" });
        continue;
      }
      break;
    }

    return { type: "path", segments };
  }

  private parseCall(name: string): CallExpression {
    this.expect("(");
    const args: DslqlExpression[] = [];
    this.skipWhitespace();
    if (this.peek() !== ")") {
      while (true) {
        args.push(this.parsePipe());
        this.skipWhitespace();
        if (this.peek() !== ",") {
          break;
        }
        this.index += 1;
      }
    }
    this.expect(")");
    return { type: "call", name, args };
  }

  private parseObject(): ObjectExpression {
    this.expect("{");
    const fields: Array<{ key: string; value: DslqlExpression }> = [];
    this.skipWhitespace();
    if (this.peek() !== "}") {
      while (true) {
        const key = this.parseIdentifier("Expected object key");
        this.skipWhitespace();
        this.expect(":");
        const value = this.parsePipe();
        fields.push({ key, value });
        this.skipWhitespace();
        if (this.peek() !== ",") {
          break;
        }
        this.index += 1;
      }
    }
    this.expect("}");
    return { type: "object", fields };
  }

  private parseCollect(): ArrayCollectExpression {
    this.expect("[");
    const expression = this.parsePipe();
    this.expect("]");
    return { type: "collect", expression };
  }

  private parseString(): string {
    const start = this.index;
    this.expect('"');
    let value = "";
    while (!this.isAtEnd()) {
      const char = this.peek();
      if (char === '"') {
        this.index += 1;
        return value;
      }
      if (char === "\\") {
        this.index += 1;
        const escaped = this.peek();
        if (escaped === undefined) {
          break;
        }
        value += escaped;
        this.index += 1;
        continue;
      }
      value += char;
      this.index += 1;
    }
    throw new DslqlParseError("Unterminated string", start + 1, this.index + 1);
  }

  private tryParseNumber(): number | undefined {
    this.skipWhitespace();
    const match = /^-?\d+(?:\.\d+)?/.exec(this.input.slice(this.index));
    if (!match) {
      return undefined;
    }
    this.index += match[0].length;
    return Number(match[0]);
  }

  private tryParseIdentifier(): string | undefined {
    this.skipWhitespace();
    const match = /^[A-Za-z_][A-Za-z0-9_-]*/.exec(this.input.slice(this.index));
    if (!match) {
      return undefined;
    }
    this.index += match[0].length;
    return match[0];
  }

  private parseIdentifier(message: string): string {
    const identifier = this.tryParseIdentifier();
    if (!identifier) {
      throw this.error(message);
    }
    return identifier;
  }

  private consumeKeyword(keyword: "and" | "not" | "or"): boolean {
    this.skipWhitespace();
    if (!this.input.slice(this.index).startsWith(keyword)) {
      return false;
    }
    const nextChar = this.input[this.index + keyword.length];
    if (nextChar && /[A-Za-z0-9_-]/.test(nextChar)) {
      return false;
    }
    this.index += keyword.length;
    this.skipWhitespace();
    return true;
  }

  private consumeOperator(): ComparisonOperator | undefined {
    this.skipWhitespace();
    const operators: ComparisonOperator[] = ["==", "!=", ">=", "<=", ">", "<"];
    for (const operator of operators) {
      if (this.input.slice(this.index).startsWith(operator)) {
        this.index += operator.length;
        this.skipWhitespace();
        return operator;
      }
    }
    return undefined;
  }

  private expect(char: string): void {
    this.skipWhitespace();
    if (this.peek() !== char) {
      throw this.error(`Expected '${char}'`);
    }
    this.index += char.length;
    this.skipWhitespace();
  }

  private skipWhitespace(): void {
    while (!this.isAtEnd() && /\s/.test(this.input[this.index] ?? "")) {
      this.index += 1;
    }
  }

  private peek(): string | undefined {
    return this.input[this.index];
  }

  private isAtEnd(): boolean {
    return this.index >= this.input.length;
  }

  private error(message: string): DslqlParseError {
    return new DslqlParseError(message, this.index + 1, this.index + 2);
  }
}

function asArray(value: DslqlValue | undefined): DslqlValue[] {
  if (Array.isArray(value)) {
    return value;
  }
  return value === undefined ? [] : [value];
}

function isObject(value: DslqlValue | undefined): value is DslqlObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScalar(value: DslqlValue | undefined): value is DslqlLiteral {
  return value === null || ["boolean", "number", "string"].includes(typeof value);
}

function truthy(value: DslqlValue | undefined): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return Boolean(value);
}

function compareValues(left: DslqlValue | undefined, right: DslqlValue | undefined, operator: ComparisonOperator): boolean {
  switch (operator) {
    case "==":
      return left === right;
    case "!=":
      return left !== right;
    case ">":
      return Number(left) > Number(right);
    case ">=":
      return Number(left) >= Number(right);
    case "<":
      return Number(left) < Number(right);
    case "<=":
      return Number(left) <= Number(right);
  }
}

function firstValue(values: DslqlValue[]): DslqlValue | undefined {
  return values[0];
}

function comparableValue(value: DslqlValue | undefined): string | number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (value === null || value === undefined) {
    return "";
  }
  return JSON.stringify(value);
}

function stableStringify(value: DslqlValue | undefined): string {
  if (isScalar(value)) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return "null";
}

function evaluateStageArgument(
  argument: DslqlExpression | undefined,
  context: EvaluationContext,
): DslqlValue | undefined {
  if (!argument) {
    return undefined;
  }
  return firstValue(evaluateExpression(argument, context.runtime.root, context));
}

function evaluatePath(expression: PathExpression, current: DslqlValue): DslqlValue[] {
  let stream: Array<DslqlValue | undefined> = [current];
  for (const segment of expression.segments) {
    if (segment.type === "field") {
      const next: Array<DslqlValue | undefined> = [];
      for (const value of stream) {
        if (!isObject(value)) {
          if (!segment.optional) {
            continue;
          }
          continue;
        }
        const fieldValue = value[segment.name];
        if (fieldValue === undefined && !segment.optional) {
          continue;
        }
        next.push(fieldValue);
      }
      stream = next;
      continue;
    }

    const next: Array<DslqlValue | undefined> = [];
    for (const value of stream) {
      next.push(...asArray(value));
    }
    stream = next;
  }
  return stream.filter((value): value is DslqlValue => value !== undefined);
}

function evaluateFunction(
  expression: CallExpression,
  current: DslqlValue,
  context: EvaluationContext,
): DslqlValue[] {
  const args = expression.args.map(
    (arg) => firstValue(evaluateExpression(arg, current, context)) ?? null,
  );
  switch (expression.name) {
    case "len": {
      const value = args[0];
      if (Array.isArray(value) || typeof value === "string") {
        return [value.length];
      }
      return [0];
    }
    default: {
      const fn = context.runtime.functions?.[expression.name];
      return fn ? fn([current], args, context.runtime) : [];
    }
  }
}

function evaluatePipeStage(
  stage: DslqlExpression,
  stream: DslqlValue[],
  context: EvaluationContext,
): DslqlValue[] {
  if (stage.type === "call") {
    switch (stage.name) {
      case "select": {
        const condition = stage.args[0];
        if (!condition) {
          return [];
        }
        return stream.filter((value) =>
          truthy(firstValue(evaluateExpression(condition, value, context))),
        );
      }
      case "map": {
        const mapper = stage.args[0];
        if (!mapper) {
          return stream;
        }
        return stream.flatMap((value) => evaluateExpression(mapper, value, context));
      }
      case "sort_by": {
        const sorter = stage.args[0];
        if (!sorter) {
          return [...stream];
        }
        return [...stream].sort((left, right) => {
          const leftValue = comparableValue(
            firstValue(evaluateExpression(sorter, left, context)),
          );
          const rightValue = comparableValue(
            firstValue(evaluateExpression(sorter, right, context)),
          );
          if (leftValue < rightValue) {
            return -1;
          }
          if (leftValue > rightValue) {
            return 1;
          }
          return 0;
        });
      }
      case "limit": {
        const value = evaluateStageArgument(stage.args[0], context);
        return stream.slice(0, Math.max(0, Number(value ?? 0)));
      }
      case "unique_by": {
        const selector = stage.args[0];
        if (!selector) {
          return [...new Map(stream.map((value) => [stableStringify(value), value])).values()];
        }
        const seen = new Set<string>();
        const unique: DslqlValue[] = [];
        for (const value of stream) {
          const key = stableStringify(
            firstValue(evaluateExpression(selector, value, context)),
          );
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);
          unique.push(value);
        }
        return unique;
      }
      default:
        break;
    }
  }

  if (stage.type === "collect") {
    return [stream.flatMap((value) => evaluateExpression(stage.expression, value, context))];
  }

  return stream.flatMap((value) => evaluateExpression(stage, value, context));
}

function evaluateExpression(
  expression: DslqlExpression,
  current: DslqlValue,
  context: EvaluationContext,
): DslqlValue[] {
  switch (expression.type) {
    case "literal":
      return [expression.value];
    case "path":
      return expression.segments.length === 0 ? [current] : evaluatePath(expression, current);
    case "call":
      return evaluateFunction(expression, current, context);
    case "object": {
      const object: DslqlObject = Object.fromEntries(
        expression.fields.map((field) => [
          field.key,
          firstValue(evaluateExpression(field.value, current, context)) ?? null,
        ]),
      );
      return [object];
    }
    case "collect":
      return [evaluateExpression(expression.expression, current, context)];
    case "unary":
      return [!truthy(firstValue(evaluateExpression(expression.operand, current, context)))];
    case "binary": {
      if (expression.operator === "and") {
        const left = firstValue(evaluateExpression(expression.left, current, context));
        return [truthy(left) && truthy(firstValue(evaluateExpression(expression.right, current, context)))];
      }
      if (expression.operator === "or") {
        const left = firstValue(evaluateExpression(expression.left, current, context));
        return [truthy(left) || truthy(firstValue(evaluateExpression(expression.right, current, context)))];
      }
      return [compareValues(
        firstValue(evaluateExpression(expression.left, current, context)),
        firstValue(evaluateExpression(expression.right, current, context)),
        expression.operator,
      )];
    }
    case "pipe": {
      let stream = context.inputStream.length > 0 ? [...context.inputStream] : [current];
      for (const stage of expression.stages) {
        stream = evaluatePipeStage(stage, stream, { ...context, inputStream: stream });
      }
      return stream;
    }
  }
}

function collectReferences(expression: DslqlExpression, refs: Set<string>): void {
  switch (expression.type) {
    case "binary": {
      if (
        ["==", "!="].includes(expression.operator) &&
        expression.left.type === "path" &&
        expression.right.type === "literal" &&
        typeof expression.right.value === "string"
      ) {
        const lastField = [...expression.left.segments].reverse().find((segment) => segment.type === "field");
        if (lastField?.name === "id") {
          refs.add(expression.right.value);
        }
      }
      collectReferences(expression.left, refs);
      collectReferences(expression.right, refs);
      return;
    }
    case "call":
      for (const arg of expression.args) {
        collectReferences(arg, refs);
      }
      return;
    case "object":
      for (const field of expression.fields) {
        collectReferences(field.value, refs);
      }
      return;
    case "collect":
      collectReferences(expression.expression, refs);
      return;
    case "pipe":
      for (const stage of expression.stages) {
        collectReferences(stage, refs);
      }
      return;
    case "unary":
      collectReferences(expression.operand, refs);
      return;
    default:
      return;
  }
}

export function parseDslqlExpression(input: string): DslqlExpression {
  return new Parser(input).parse();
}

export function collectDslqlReferenceIds(input: string): string[] {
  const refs = new Set<string>();
  collectReferences(parseDslqlExpression(input), refs);
  return [...refs];
}

export function evaluateDslqlExpression(input: string, runtime: DslqlRuntime): DslqlValue[] {
  const expression = parseDslqlExpression(input);
  return evaluateExpression(expression, runtime.root, {
    runtime,
    inputStream: [runtime.root],
  });
}