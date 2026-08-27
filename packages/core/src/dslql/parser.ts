import {
  type DslqlArrayExpression,
  type DslqlBinaryOperator,
  type DslqlCallExpression,
  type DslqlComparisonOperator,
  type DslqlExpression,
  type DslqlObjectExpression,
  type DslqlPathExpression,
  type DslqlPathSegment,
  type DslqlSourcePosition,
  type DslqlSourceRange,
  validateDslqlAst,
} from "./ast.js";

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*/;
const NUMBER_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/;

export class DslqlParseError extends Error {
  readonly offset: number;
  readonly endOffset: number;
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;

  constructor(message: string, range: DslqlSourceRange) {
    super(message);
    this.name = "DslqlParseError";
    this.offset = range.start.offset;
    this.endOffset = range.end.offset;
    this.line = range.start.line;
    this.column = range.start.column;
    this.endLine = range.end.line;
    this.endColumn = range.end.column;
  }
}

class Parser {
  private index = 0;
  private readonly lineStarts = [0];

  constructor(private readonly input: string) {
    for (let index = 0; index < input.length; index += 1) {
      if (input[index] === "\n") {
        this.lineStarts.push(index + 1);
      }
    }
  }

  parse(): DslqlExpression {
    this.skipWhitespace();
    if (this.isAtEnd()) {
      throw this.error("Expected expression");
    }
    const expression = this.parsePipe();
    this.skipWhitespace();
    if (!this.isAtEnd()) {
      throw this.error("Unexpected token");
    }
    validateDslqlAst(expression);
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
    if (stages.length === 1) {
      return stages[0] as DslqlExpression;
    }
    return {
      kind: "pipe",
      stages,
      range: this.cover(stages[0]!.range, stages.at(-1)!.range),
    };
  }

  private parseOr(): DslqlExpression {
    let expression = this.parseAnd();
    while (this.consumeKeyword("or")) {
      expression = this.binary("or", expression, this.parseAnd());
    }
    return expression;
  }

  private parseAnd(): DslqlExpression {
    let expression = this.parseComparison();
    while (this.consumeKeyword("and")) {
      expression = this.binary("and", expression, this.parseComparison());
    }
    return expression;
  }

  private parseComparison(): DslqlExpression {
    const left = this.parseUnary();
    const operator = this.consumeComparisonOperator();
    if (!operator) {
      return left;
    }
    const expression = this.binary(operator, left, this.parseUnary());
    if (this.peekComparisonOperator()) {
      throw this.error(
        "Chained comparisons require parentheses and a logical operator",
      );
    }
    return expression;
  }

  private parseUnary(): DslqlExpression {
    this.skipWhitespace();
    const start = this.index;
    if (this.consumeKeyword("not")) {
      const operand = this.parseUnary();
      return {
        kind: "unary",
        operator: "not",
        operand,
        range: this.range(start, operand.range.end.offset),
      };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): DslqlExpression {
    this.skipWhitespace();
    const start = this.index;
    const char = this.peek();
    if (char === "." || char === "$") {
      return this.parsePath();
    }
    if (char === "@") {
      this.index += 1;
      const id = this.parseIdentifier(
        "Expected reference identifier after '@'",
      );
      return { kind: "reference", id, range: this.range(start) };
    }
    if (char === '"') {
      return {
        kind: "literal",
        value: this.parseString(),
        range: this.range(start),
      };
    }
    if (char === "{") {
      return this.parseObject();
    }
    if (char === "[") {
      return this.parseArray();
    }
    if (char === "(") {
      this.index += 1;
      const expression = this.parsePipe();
      this.expect(")");
      return { ...expression, range: this.range(start) };
    }

    const identifier = this.tryParseIdentifier();
    if (identifier) {
      const literal = this.keywordLiteral(identifier, start);
      if (literal) {
        return literal;
      }
      this.skipWhitespace();
      if (this.peek() !== "(") {
        throw this.error(`Function '${identifier}' requires parentheses`);
      }
      return this.parseCall(identifier, start);
    }

    const number = this.tryParseNumber();
    if (number !== undefined) {
      return { kind: "literal", value: number, range: this.range(start) };
    }
    throw this.error("Expected expression");
  }

  private parsePath(): DslqlPathExpression {
    const start = this.index;
    const origin = this.peek() === "$" ? "root" : "current";
    this.index += 1;
    const segments: DslqlPathSegment[] = [];

    if (origin === "current" && this.isIdentifierStart(this.peek())) {
      segments.push(this.parsePropertySegment());
    }

    while (true) {
      this.skipWhitespace();
      if (this.peek() === ".") {
        this.index += 1;
        segments.push(this.parsePropertySegment());
        continue;
      }
      if (this.peek() === "[") {
        segments.push(this.parseBracketSegment());
        continue;
      }
      break;
    }
    return { kind: "path", origin, segments, range: this.range(start) };
  }

  private parsePropertySegment(): DslqlPathSegment {
    const start = this.index;
    const key = this.parseIdentifier("Expected property name");
    const optional = this.consumeOptionalMarker();
    return { kind: "property", key, optional, range: this.range(start) };
  }

  private parseBracketSegment(): DslqlPathSegment {
    const start = this.index;
    this.expect("[");
    if (this.peek() === "]") {
      this.index += 1;
      const optional = this.consumeOptionalMarker();
      return { kind: "iterate", optional, range: this.range(start) };
    }

    if (this.peek() === '"') {
      const key = this.parseString();
      this.expect("]");
      const optional = this.consumeOptionalMarker();
      return { kind: "property", key, optional, range: this.range(start) };
    }

    const index = this.tryParseUnsignedInteger();
    if (index === undefined) {
      throw this.error("Expected array index, string key, or ']'");
    }
    this.expect("]");
    const optional = this.consumeOptionalMarker();
    return { kind: "index", index, optional, range: this.range(start) };
  }

  private parseCall(name: string, start: number): DslqlCallExpression {
    this.expect("(");
    const args: DslqlExpression[] = [];
    if (this.peek() !== ")") {
      while (true) {
        args.push(this.parsePipe());
        if (!this.consume(",")) {
          break;
        }
      }
    }
    this.expect(")");
    return { kind: "call", name, arguments: args, range: this.range(start) };
  }

  private parseObject(): DslqlObjectExpression {
    const start = this.index;
    this.expect("{");
    const fields: DslqlObjectExpression["fields"] = [];
    const keys = new Set<string>();
    if (this.peek() !== "}") {
      while (true) {
        const fieldStart = this.index;
        const key =
          this.peek() === '"'
            ? this.parseString()
            : this.parseIdentifier("Expected object field name");
        if (keys.has(key)) {
          throw this.error(`Duplicate object field '${key}'`, fieldStart);
        }
        keys.add(key);
        this.expect(":");
        const value = this.parsePipe();
        fields.push({
          kind: "field",
          key,
          value,
          range: this.range(fieldStart, value.range.end.offset),
        });
        if (!this.consume(",")) {
          break;
        }
      }
    }
    this.expect("}");
    return { kind: "object", fields, range: this.range(start) };
  }

  private parseArray(): DslqlArrayExpression {
    const start = this.index;
    this.expect("[");
    const elements: DslqlExpression[] = [];
    if (this.peek() !== "]") {
      while (true) {
        elements.push(this.parsePipe());
        if (!this.consume(",")) {
          break;
        }
      }
    }
    this.expect("]");
    return { kind: "array", elements, range: this.range(start) };
  }

  private parseString(): string {
    const start = this.index;
    this.index += 1;
    let escaped = false;
    while (!this.isAtEnd()) {
      const char = this.peek();
      this.index += 1;
      if (!escaped && char === '"') {
        const source = this.input.slice(start, this.index);
        try {
          return JSON.parse(source) as string;
        } catch {
          throw this.error("Invalid string escape", start);
        }
      }
      if (!escaped && char === "\\") {
        escaped = true;
      } else {
        escaped = false;
      }
      if (char === "\n" && !escaped) {
        throw this.error(
          "String literals cannot contain an unescaped newline",
          start,
        );
      }
    }
    throw this.error("Unterminated string", start);
  }

  private keywordLiteral(
    identifier: string,
    start: number,
  ): DslqlExpression | undefined {
    if (identifier === "true" || identifier === "false") {
      return {
        kind: "literal",
        value: identifier === "true",
        range: this.range(start),
      };
    }
    if (identifier === "null") {
      return { kind: "literal", value: null, range: this.range(start) };
    }
    return undefined;
  }

  private binary(
    operator: DslqlBinaryOperator,
    left: DslqlExpression,
    right: DslqlExpression,
  ): DslqlExpression {
    return {
      kind: "binary",
      operator,
      left,
      right,
      range: this.cover(left.range, right.range),
    };
  }

  private consumeComparisonOperator(): DslqlComparisonOperator | undefined {
    this.skipWhitespace();
    const symbolic: DslqlComparisonOperator[] = [
      "==",
      "!=",
      ">=",
      "<=",
      ">",
      "<",
    ];
    for (const operator of symbolic) {
      if (this.input.startsWith(operator, this.index)) {
        this.index += operator.length;
        this.skipWhitespace();
        return operator;
      }
    }
    return this.consumeKeyword("in") ? "in" : undefined;
  }

  private peekComparisonOperator(): boolean {
    const saved = this.index;
    const found = Boolean(this.consumeComparisonOperator());
    this.index = saved;
    return found;
  }

  private consumeKeyword(keyword: "and" | "in" | "not" | "or"): boolean {
    this.skipWhitespace();
    if (!this.input.startsWith(keyword, this.index)) {
      return false;
    }
    const next = this.input[this.index + keyword.length];
    if (next && /[A-Za-z0-9_-]/.test(next)) {
      return false;
    }
    this.index += keyword.length;
    this.skipWhitespace();
    return true;
  }

  private tryParseIdentifier(): string | undefined {
    this.skipWhitespace();
    const match = IDENTIFIER_PATTERN.exec(this.input.slice(this.index));
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

  private tryParseNumber(): number | undefined {
    this.skipWhitespace();
    const match = NUMBER_PATTERN.exec(this.input.slice(this.index));
    if (!match) {
      return undefined;
    }
    this.index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) {
      throw this.error(
        "Number literal must be finite",
        this.index - match[0].length,
      );
    }
    return value;
  }

  private tryParseUnsignedInteger(): number | undefined {
    this.skipWhitespace();
    const match = /^(?:0|[1-9]\d*)/.exec(this.input.slice(this.index));
    if (!match) {
      return undefined;
    }
    this.index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isSafeInteger(value)) {
      throw this.error(
        "Array index must be a non-negative safe integer",
        this.index - match[0].length,
      );
    }
    return value;
  }

  private consumeOptionalMarker(): boolean {
    if (this.peek() !== "?") {
      return false;
    }
    this.index += 1;
    return true;
  }

  private consume(char: string): boolean {
    this.skipWhitespace();
    if (this.peek() !== char) {
      return false;
    }
    this.index += char.length;
    this.skipWhitespace();
    return true;
  }

  private expect(char: string): void {
    if (!this.consume(char)) {
      throw this.error(`Expected '${char}'`);
    }
  }

  private skipWhitespace(): void {
    while (!this.isAtEnd() && /\s/.test(this.peek() ?? "")) {
      this.index += 1;
    }
  }

  private isIdentifierStart(char: string | undefined): boolean {
    return Boolean(char && /[A-Za-z_]/.test(char));
  }

  private peek(): string | undefined {
    return this.input[this.index];
  }

  private isAtEnd(): boolean {
    return this.index >= this.input.length;
  }

  private position(offset: number): DslqlSourcePosition {
    let low = 0;
    let high = this.lineStarts.length;
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2);
      if ((this.lineStarts[middle] ?? 0) <= offset) {
        low = middle;
      } else {
        high = middle;
      }
    }
    const lineStart = this.lineStarts[low] ?? 0;
    return { offset, line: low + 1, column: offset - lineStart + 1 };
  }

  private range(start: number, end = this.index): DslqlSourceRange {
    return {
      start: this.position(start),
      end: this.position(Math.max(start, end)),
    };
  }

  private cover(
    left: DslqlSourceRange,
    right: DslqlSourceRange,
  ): DslqlSourceRange {
    return { start: left.start, end: right.end };
  }

  private error(message: string, start = this.index): DslqlParseError {
    return new DslqlParseError(
      message,
      this.range(
        start,
        Math.min(this.input.length, Math.max(start + 1, this.index + 1)),
      ),
    );
  }
}

export function parseDslqlExpression(input: string): DslqlExpression {
  return new Parser(input).parse();
}
