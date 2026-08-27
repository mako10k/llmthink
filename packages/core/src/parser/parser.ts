import {
  type Annotation,
  type AnnotationKind,
  type ComparisonStatement,
  type ConfidenceDecl,
  type DecisionStatement,
  type DocumentAst,
  type DomainDecl,
  type EvidenceResource,
  type EvidenceResourceLocator,
  type EvidenceResourceMetadataValue,
  type EvidenceStatement,
  type FrameworkDecl,
  type FrameworkRule,
  type PendingStatement,
  type PartitionMember,
  type PartitionStatement,
  type PremiseStatement,
  type ProblemDecl,
  type QueryDecl,
  type SourceSpan,
  type StepDecl,
  type StepStatement,
  type TextBody,
  type ViewpointStatement,
} from "../model/ast.js";
import {
  ConfidenceValueError,
  createConfidenceAssessment,
  parseUnitRational,
  resolveConfidenceKeyword,
  type ConfidenceEpistemicTag,
} from "../model/confidence.js";
import {
  createDocumentDeclarationIndex,
  DuplicateDocumentDeclarationError,
} from "../model/declarations.js";
import {
  createEvidenceResource,
  EvidenceResourceValidationError,
} from "../model/evidence-resource.js";

const IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;

function span(line: number, column = 1): SourceSpan {
  return { line, column };
}

function firstNonWhitespaceColumn(line: string): number {
  const indent = currentIndent(line);
  return indent + 1;
}

function tokenColumn(line: string, token: string): number {
  const index = line.indexOf(token);
  return (index >= 0 ? index : currentIndent(line)) + 1;
}

function stripQuotes(value: string): string {
  return value.replace(/^"/, "").replace(/"$/, "");
}

function trimBlankLines(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;

  while (start < end && lines[start]?.trim() === "") {
    start += 1;
  }

  while (end > start && lines[end - 1]?.trim() === "") {
    end -= 1;
  }

  return lines.slice(start, end);
}

function currentIndent(line: string): number {
  return line.match(/^\s*/)?.[0].length ?? 0;
}

function isCommentLine(line: string): boolean {
  return line.trimStart().startsWith("#");
}

function nextSignificantLineIndex(lines: string[], startIndex: number): number {
  let index = startIndex;
  while (index < lines.length) {
    const rawLine = lines[index] ?? "";
    const line = rawLine.trim();
    if (!line || isCommentLine(rawLine)) {
      index += 1;
      continue;
    }
    break;
  }
  return index;
}

function parseIdentifierAfterKeyword(
  header: string,
  keyword: string,
): string | undefined {
  const prefix = `${keyword} `;
  if (!header.startsWith(prefix) || !header.endsWith(":")) {
    return undefined;
  }
  const identifier = header.slice(prefix.length, -1).trim();
  return /^[A-Za-z][A-Za-z0-9_-]*$/.test(identifier) ? identifier : undefined;
}

function parseStepHeader(
  header: string,
): { valid: true; id?: string } | { valid: false } {
  if (header === "step:") {
    return { valid: true };
  }

  const prefix = "step ";
  if (!header.startsWith(prefix) || !header.endsWith(":")) {
    return { valid: false };
  }

  const identifier = header.slice(prefix.length, -1).trim();
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(identifier)) {
    return { valid: false };
  }

  return { valid: true, id: identifier };
}

function synthesizeStepId(statementId: string): string {
  return `S-${statementId}`;
}

function isStatementHeader(line: string): boolean {
  return (
    line.startsWith("premise ") ||
    line.startsWith("evidence ") ||
    line.startsWith("pending ") ||
    line.startsWith("viewpoint ") ||
    line.startsWith("partition ") ||
    line.startsWith("comparison ") ||
    line.startsWith("decision ")
  );
}

function implicitStepFromStatement(
  statement: StepStatement & { nextIndex: number },
): [StepDecl, number] {
  return [
    {
      id: synthesizeStepId(statement.id),
      statement,
      span: statement.span,
      syntax: {
        step: "implicit",
        stepId: "synthetic",
      },
    },
    statement.nextIndex,
  ];
}

function parsePartitionMemberLine(line: string): PartitionMember | undefined {
  const separatorIndex = line.indexOf(":=");
  if (separatorIndex <= 0) {
    return undefined;
  }
  const name = line.slice(0, separatorIndex).trim();
  const predicate = line.slice(separatorIndex + 2).trim();
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name) || !predicate) {
    return undefined;
  }
  return { name, predicate };
}

function parseAnnotationKind(header: string): AnnotationKind | undefined {
  const match =
    /^annotation\s+(explanation|rationale|status|caveat|todo|orphan_future|orphan_reference):$/.exec(
      header,
    );
  return match?.[1] as AnnotationKind | undefined;
}

function parseAnnotations(
  lines: string[],
  startIndex: number,
  expectedIndent: number,
): { annotations: Annotation[]; nextIndex: number } {
  const annotations: Annotation[] = [];
  let index = startIndex;

  while (index < lines.length) {
    index = nextSignificantLineIndex(lines, index);
    if (index >= lines.length) {
      break;
    }

    const rawHeader = lines[index] ?? "";
    const headerIndent = currentIndent(rawHeader);
    if (headerIndent < expectedIndent) {
      break;
    }
    if (headerIndent !== expectedIndent) {
      break;
    }

    const kind = parseAnnotationKind(rawHeader.trim());
    if (!kind) {
      if (rawHeader.trim().startsWith("annotation ")) {
        throw new ParseError(
          "Invalid annotation declaration",
          index + 1,
          firstNonWhitespaceColumn(rawHeader),
          rawHeader.length + 1,
        );
      }
      break;
    }

    const { text, body, nextIndex } = parseIndentedTextBody(
      lines,
      index,
      "Annotation text is required",
    );

    annotations.push({
      kind,
      text,
      body,
      span: span(index + 1, firstNonWhitespaceColumn(rawHeader)),
    });
    index = nextIndex;
  }

  return { annotations, nextIndex: index };
}

const EVIDENCE_RESOURCE_FIELDS = [
  "url",
  "file",
  "blob",
  "digest",
  "mime",
  "label",
] as const;

type EvidenceResourceField = (typeof EVIDENCE_RESOURCE_FIELDS)[number];

interface ParsedEvidenceResourceField {
  name: EvidenceResourceField;
  value: string;
  span: SourceSpan;
}

function isEvidenceResourceField(
  value: string,
): value is EvidenceResourceField {
  return (EVIDENCE_RESOURCE_FIELDS as readonly string[]).includes(value);
}

function parseEvidenceResourceField(
  rawLine: string,
  lineIndex: number,
): ParsedEvidenceResourceField {
  const line = rawLine.trim();
  const match = /^([A-Za-z][A-Za-z0-9_-]*)\s+(".*")$/.exec(line);
  if (!match) {
    throw new ParseError(
      "Invalid evidence resource field",
      lineIndex + 1,
      firstNonWhitespaceColumn(rawLine),
      rawLine.length + 1,
    );
  }

  const name = match[1] ?? "";
  if (!isEvidenceResourceField(name)) {
    throw new ParseError(
      `Unknown evidence resource field '${name}'`,
      lineIndex + 1,
      firstNonWhitespaceColumn(rawLine),
      rawLine.length + 1,
    );
  }

  return {
    name,
    value: stripQuotes(match[2] ?? ""),
    span: span(lineIndex + 1, firstNonWhitespaceColumn(rawLine)),
  };
}

function validateEvidenceResourceHeader(
  rawHeader: string,
  startIndex: number,
  expectedIndent: number,
): void {
  const header = rawHeader.trim();
  if (/^resource\s+/.test(header)) {
    throw new ParseError(
      "Evidence resources must use anonymous 'resource:' syntax",
      startIndex + 1,
      firstNonWhitespaceColumn(rawHeader),
      rawHeader.length + 1,
    );
  }
  if (header !== "resource:") {
    throw new ParseError(
      "Invalid evidence resource declaration",
      startIndex + 1,
      firstNonWhitespaceColumn(rawHeader),
      rawHeader.length + 1,
    );
  }
  if (currentIndent(rawHeader) !== expectedIndent) {
    throw new ParseError(
      "Invalid evidence resource indentation",
      startIndex + 1,
      firstNonWhitespaceColumn(rawHeader),
      rawHeader.length + 1,
    );
  }
}

function collectEvidenceResourceFields(
  lines: string[],
  startIndex: number,
  expectedIndent: number,
): {
  fields: Map<EvidenceResourceField, ParsedEvidenceResourceField>;
  nextIndex: number;
} {
  const fields = new Map<EvidenceResourceField, ParsedEvidenceResourceField>();
  let index = startIndex + 1;
  while (index < lines.length) {
    const rawLine = lines[index] ?? "";
    if (!rawLine.trim() || isCommentLine(rawLine)) {
      index += 1;
      continue;
    }
    const indent = currentIndent(rawLine);
    if (indent <= expectedIndent) break;
    if (indent !== expectedIndent + 2) {
      throw new ParseError(
        "Invalid evidence resource field indentation",
        index + 1,
        firstNonWhitespaceColumn(rawLine),
        rawLine.length + 1,
      );
    }
    const field = parseEvidenceResourceField(rawLine, index);
    if (fields.has(field.name)) {
      throw new ParseError(
        `Duplicate evidence resource field '${field.name}'`,
        index + 1,
        firstNonWhitespaceColumn(rawLine),
        rawLine.length + 1,
      );
    }
    fields.set(field.name, field);
    index += 1;
  }
  return { fields, nextIndex: index };
}

function requireEvidenceResourceLocatorField(
  fields: Map<EvidenceResourceField, ParsedEvidenceResourceField>,
  rawHeader: string,
  startIndex: number,
): ParsedEvidenceResourceField {
  const locatorFields = (["url", "file", "blob"] as const)
    .map((kind) => fields.get(kind))
    .filter((field): field is ParsedEvidenceResourceField => Boolean(field));
  if (locatorFields.length === 0) {
    throw new ParseError(
      "Evidence resource locator is required",
      startIndex + 1,
      firstNonWhitespaceColumn(rawHeader),
      rawHeader.length + 1,
    );
  }
  if (locatorFields.length > 1) {
    const field = locatorFields[1] ?? locatorFields[0]!;
    throw new ParseError(
      "Evidence resource must have exactly one locator",
      field.span.line,
      field.span.column,
      field.span.column + field.value.length,
    );
  }
  return locatorFields[0]!;
}

function toEvidenceResourceLocator(
  field: ParsedEvidenceResourceField,
): EvidenceResourceLocator {
  return {
    kind: field.name as EvidenceResourceLocator["kind"],
    value: field.value,
    span: field.span,
  };
}

function toEvidenceResourceMetadata(
  field: ParsedEvidenceResourceField | undefined,
): EvidenceResourceMetadataValue | undefined {
  return field ? { value: field.value, span: field.span } : undefined;
}

function evidenceResourceParseError(
  error: EvidenceResourceValidationError,
): ParseError {
  return new ParseError(
    error.message,
    error.span.line,
    error.span.column,
    error.endColumn,
  );
}

function parseEvidenceResource(
  lines: string[],
  startIndex: number,
  expectedIndent: number,
): { resource: EvidenceResource; nextIndex: number } {
  const rawHeader = lines[startIndex] ?? "";
  validateEvidenceResourceHeader(rawHeader, startIndex, expectedIndent);
  const { fields, nextIndex } = collectEvidenceResourceFields(
    lines,
    startIndex,
    expectedIndent,
  );
  const resourceSpan = span(
    startIndex + 1,
    firstNonWhitespaceColumn(rawHeader),
  );
  try {
    return {
      resource: createEvidenceResource({
        locator: toEvidenceResourceLocator(
          requireEvidenceResourceLocatorField(fields, rawHeader, startIndex),
        ),
        digest: toEvidenceResourceMetadata(fields.get("digest")),
        mime: toEvidenceResourceMetadata(fields.get("mime")),
        label: toEvidenceResourceMetadata(fields.get("label")),
        span: resourceSpan,
      }),
      nextIndex,
    };
  } catch (error) {
    if (error instanceof EvidenceResourceValidationError) {
      throw evidenceResourceParseError(error);
    }
    throw error;
  }
}

function parseEvidenceChildren(
  lines: string[],
  startIndex: number,
  expectedIndent: number,
): {
  resources: EvidenceResource[];
  annotations: Annotation[];
  nextIndex: number;
} {
  const resources: EvidenceResource[] = [];
  const annotations: Annotation[] = [];
  let index = startIndex;

  while (index < lines.length) {
    index = nextSignificantLineIndex(lines, index);
    if (index >= lines.length) break;
    const rawLine = lines[index] ?? "";
    if (currentIndent(rawLine) !== expectedIndent) break;
    const line = rawLine.trim();
    if (line === "resource:" || line.startsWith("resource ")) {
      const parsed = parseEvidenceResource(lines, index, expectedIndent);
      resources.push(parsed.resource);
      index = parsed.nextIndex;
      continue;
    }
    if (line.startsWith("annotation ")) {
      const parsed = parseAnnotations(lines, index, expectedIndent);
      annotations.push(...parsed.annotations);
      index = parsed.nextIndex;
      continue;
    }
    break;
  }

  return { resources, annotations, nextIndex: index };
}

function parseDecisionHeader(
  header: string,
): { id: string; basedOn: string[] } | undefined {
  if (!header.startsWith("decision ") || !header.endsWith(":")) {
    return undefined;
  }
  const body = header.slice("decision ".length, -1).trim();
  const basedOnMarker = " based_on ";
  const basedOnIndex = body.indexOf(basedOnMarker);
  const id = basedOnIndex === -1 ? body : body.slice(0, basedOnIndex).trim();
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(id)) {
    return undefined;
  }
  if (basedOnIndex === -1) {
    return { id, basedOn: [] };
  }
  const basedOnText = body.slice(basedOnIndex + basedOnMarker.length).trim();
  const basedOn = basedOnText
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return { id, basedOn };
}

function parseComparisonHeader(header: string):
  | {
      id: string;
      problemId: string;
      viewpointId: string;
      relation: ComparisonStatement["relation"];
      leftDecisionId: string;
      rightDecisionId: string;
    }
  | undefined {
  if (!header.endsWith(":")) {
    return undefined;
  }
  const body = header.slice(0, -1);
  const commaIndex = body.indexOf(",");
  if (commaIndex < 0 || body.indexOf(",", commaIndex + 1) >= 0) {
    return undefined;
  }
  const tokens = body.slice(0, commaIndex).trim().split(/\s+/u);
  const rightDecisionId = body.slice(commaIndex + 1).trim();
  if (
    tokens.length !== 9 ||
    tokens[0] !== "comparison" ||
    tokens[2] !== "on" ||
    tokens[4] !== "viewpoint" ||
    tokens[6] !== "relation"
  ) {
    return undefined;
  }
  const [, id, , problemId, , viewpointId, , relation, leftDecisionId] = tokens;
  const identifiers = [
    id,
    problemId,
    viewpointId,
    leftDecisionId,
    rightDecisionId,
  ];
  const relations: ComparisonStatement["relation"][] = [
    "preferred_over",
    "weaker_than",
    "incomparable",
    "counterexample_to",
  ];
  if (
    identifiers.some((value) => !value || !IDENTIFIER_PATTERN.test(value)) ||
    !relations.includes(relation as ComparisonStatement["relation"])
  ) {
    return undefined;
  }
  return {
    id: id!,
    problemId: problemId!,
    viewpointId: viewpointId!,
    relation: relation as ComparisonStatement["relation"],
    leftDecisionId: leftDecisionId!,
    rightDecisionId,
  };
}

function parseFrameworkRuleLine(line: string): FrameworkRule | undefined {
  const separatorIndex = line.indexOf(" ");
  if (separatorIndex <= 0) {
    return undefined;
  }
  const kind = line.slice(0, separatorIndex).trim();
  const value = line.slice(separatorIndex + 1).trim();
  if (!value || !["requires", "forbids", "warns"].includes(kind)) {
    return undefined;
  }
  return { kind: kind as FrameworkRule["kind"], value, span: span(0) };
}

export class ParseError extends Error {
  constructor(
    message: string,
    readonly line: number,
    readonly column = 1,
    readonly endColumn = column,
  ) {
    super(`${message} at line ${line}`);
  }
}

function validateDocumentDeclarationNamespace(
  document: DocumentAst,
  lines: readonly string[],
): void {
  try {
    createDocumentDeclarationIndex(document);
  } catch (error) {
    if (!(error instanceof DuplicateDocumentDeclarationError)) throw error;
    const duplicateLine = lines[error.duplicate.span.line - 1] ?? "";
    const identifierOffset = duplicateLine.indexOf(
      error.duplicate.id,
      Math.max(error.duplicate.span.column - 1, 0),
    );
    const identifierColumn =
      identifierOffset >= 0
        ? identifierOffset + 1
        : error.duplicate.span.column;
    throw new ParseError(
      error.message,
      error.duplicate.span.line,
      identifierColumn,
      identifierColumn + error.duplicate.id.length,
    );
  }
}

function validateConfidenceDeclarationUniqueness(
  declarations: readonly ConfidenceDecl[],
): void {
  const seen = new Set<string>();
  for (const declaration of declarations) {
    const key = confidenceDeclarationKey(declaration);
    if (seen.has(key)) {
      throw new ParseError(
        `Duplicate confidence declaration '${key}'`,
        declaration.span.line,
        declaration.span.column,
      );
    }
    seen.add(key);
  }
}

function confidenceDeclarationKey(declaration: ConfidenceDecl): string {
  if (declaration.kind === "source") {
    return `source:${declaration.sourceId}`;
  }
  if (declaration.kind === "edge") {
    return `edge:${declaration.sourceId}->${declaration.targetId}`;
  }
  return `declared:${declaration.targetId}`;
}

export function parseDocument(input: string): DocumentAst {
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  const document: DocumentAst = {
    domains: [],
    problems: [],
    steps: [],
    confidence: [],
    queries: [],
  };

  let index = 0;
  while (index < lines.length) {
    const rawLine = lines[index] ?? "";
    const line = rawLine.trim();
    if (!line || isCommentLine(rawLine)) {
      index += 1;
      continue;
    }

    if (line.startsWith("framework ")) {
      const [framework, nextIndex] = parseFramework(lines, index);
      document.framework = framework;
      index = nextIndex;
      continue;
    }

    if (line.startsWith("domain ")) {
      const [domain, nextIndex] = parseDomain(lines, index);
      document.domains.push(domain);
      index = nextIndex;
      continue;
    }

    if (line.startsWith("problem ")) {
      const [problem, nextIndex] = parseProblem(lines, index);
      document.problems.push(problem);
      index = nextIndex;
      continue;
    }

    if (line === "step:" || line.startsWith("step ")) {
      const [step, nextIndex] = parseStep(lines, index);
      document.steps.push(step);
      index = nextIndex;
      continue;
    }

    if (isStatementHeader(line)) {
      const statement = parseStatement(lines, index, line);
      const [step, nextIndex] = implicitStepFromStatement(statement);
      document.steps.push(step);
      index = nextIndex;
      continue;
    }

    const auxiliaryNextIndex = parseAuxiliaryTopLevel(
      document,
      lines,
      index,
      line,
    );
    if (auxiliaryNextIndex !== undefined) {
      index = auxiliaryNextIndex;
      continue;
    }

    throw new ParseError(
      `Unexpected top-level statement: ${line}`,
      index + 1,
      firstNonWhitespaceColumn(rawLine),
      rawLine.length + 1,
    );
  }

  validateDocumentDeclarationNamespace(document, lines);
  validateConfidenceDeclarationUniqueness(document.confidence);

  return document;
}

function parseAuxiliaryTopLevel(
  document: DocumentAst,
  lines: string[],
  index: number,
  line: string,
): number | undefined {
  if (line.startsWith("confidence ")) {
    const [confidence, nextIndex] = parseConfidence(lines, index);
    document.confidence.push(confidence);
    return nextIndex;
  }
  if (line.startsWith("declared_confidence ")) {
    const [confidence, nextIndex] = parseConfidence(lines, index);
    document.confidence.push(confidence);
    return nextIndex;
  }
  if (line.startsWith("query ")) {
    const [query, nextIndex] = parseQuery(lines, index);
    document.queries.push(query);
    return nextIndex;
  }
  return undefined;
}

type ParsedConfidenceHeader =
  | { kind: "source"; sourceId: string }
  | { kind: "edge"; sourceId: string; targetId: string }
  | { kind: "declared"; targetId: string };

interface ParsedConfidenceField {
  value: string;
  raw: string;
  index: number;
}

const CONFIDENCE_FIELD_NAMES = ["estimate", "range", "epistemic"] as const;
type ConfidenceFieldName = (typeof CONFIDENCE_FIELD_NAMES)[number];

function parseConfidenceHeader(
  header: string,
): ParsedConfidenceHeader | undefined {
  const edge =
    /^confidence\s+([A-Za-z][A-Za-z0-9_-]*)\s*->\s*([A-Za-z][A-Za-z0-9_-]*):$/.exec(
      header,
    );
  if (edge) {
    return { kind: "edge", sourceId: edge[1]!, targetId: edge[2]! };
  }
  const declared = /^declared_confidence\s+([A-Za-z][A-Za-z0-9_-]*):$/.exec(
    header,
  );
  if (declared) {
    return { kind: "declared", targetId: declared[1]! };
  }
  const source = /^confidence\s+([A-Za-z][A-Za-z0-9_-]*):$/.exec(header);
  return source ? { kind: "source", sourceId: source[1]! } : undefined;
}

function confidenceParseError(
  error: ConfidenceValueError,
  rawLine: string,
  lineIndex: number,
): ParseError {
  return new ParseError(
    error.message,
    lineIndex + 1,
    firstNonWhitespaceColumn(rawLine),
    rawLine.length + 1,
  );
}

function parseDefaultConfidence(
  lines: string[],
  bodyIndex: number,
  headerIndent: number,
  parsedHeader: ParsedConfidenceHeader,
  rawHeader: string,
  startIndex: number,
): [ConfidenceDecl, number] {
  if (parsedHeader.kind === "declared") {
    throw new ParseError(
      "Declared confidence must use an explicit assessment or keyword",
      bodyIndex + 1,
      firstNonWhitespaceColumn(lines[bodyIndex] ?? ""),
      (lines[bodyIndex] ?? "").length + 1,
    );
  }
  const nextIndex = nextSignificantLineIndex(lines, bodyIndex + 1);
  const rawNext = lines[nextIndex] ?? "";
  if (nextIndex < lines.length && currentIndent(rawNext) > headerIndent) {
    throw new ParseError(
      "Default confidence must not have additional fields",
      nextIndex + 1,
      firstNonWhitespaceColumn(rawNext),
      rawNext.length + 1,
    );
  }
  return [
    {
      ...parsedHeader,
      syntax: "default",
      span: span(startIndex + 1, firstNonWhitespaceColumn(rawHeader)),
    },
    nextIndex,
  ];
}

function parseKeywordConfidence(
  lines: string[],
  bodyIndex: number,
  headerIndent: number,
  parsedHeader: ParsedConfidenceHeader,
  rawHeader: string,
  startIndex: number,
): [ConfidenceDecl, number] {
  const rawBody = lines[bodyIndex] ?? "";
  const match = /^keyword\s+([A-Za-z][A-Za-z0-9_-]*)$/.exec(rawBody.trim());
  if (!match) {
    throw new ParseError(
      "Keyword confidence must use 'keyword IDENTIFIER' syntax",
      bodyIndex + 1,
      firstNonWhitespaceColumn(rawBody),
      rawBody.length + 1,
    );
  }
  const nextIndex = nextSignificantLineIndex(lines, bodyIndex + 1);
  const rawNext = lines[nextIndex] ?? "";
  if (nextIndex < lines.length && currentIndent(rawNext) > headerIndent) {
    throw new ParseError(
      "Keyword confidence must not have additional fields",
      nextIndex + 1,
      firstNonWhitespaceColumn(rawNext),
      rawNext.length + 1,
    );
  }
  try {
    return [
      {
        ...parsedHeader,
        assessment: resolveConfidenceKeyword(
          parsedHeader.kind === "edge" ? "edge" : "source",
          match[1]!,
        ),
        syntax: "keyword",
        span: span(startIndex + 1, firstNonWhitespaceColumn(rawHeader)),
      },
      nextIndex,
    ];
  } catch (error) {
    if (error instanceof ConfidenceValueError) {
      throw confidenceParseError(error, rawBody, bodyIndex);
    }
    throw error;
  }
}

function confidenceFieldName(line: string): ConfidenceFieldName | undefined {
  return CONFIDENCE_FIELD_NAMES.find(
    (name) => line.startsWith(name) && /\s/.test(line.charAt(name.length)),
  );
}

function collectConfidenceFields(
  lines: string[],
  bodyIndex: number,
  headerIndent: number,
  expectedIndent: number,
): {
  fields: Map<ConfidenceFieldName, ParsedConfidenceField>;
  nextIndex: number;
} {
  const fields = new Map<ConfidenceFieldName, ParsedConfidenceField>();
  let index = bodyIndex;
  while (index < lines.length) {
    const rawLine = lines[index] ?? "";
    if (!rawLine.trim() || isCommentLine(rawLine)) {
      index += 1;
      continue;
    }
    const indent = currentIndent(rawLine);
    if (indent <= headerIndent) break;
    if (indent !== expectedIndent) {
      throw new ParseError(
        "Invalid confidence field indentation",
        index + 1,
        firstNonWhitespaceColumn(rawLine),
        rawLine.length + 1,
      );
    }
    const line = rawLine.trim();
    const name = confidenceFieldName(line);
    if (!name) {
      throw new ParseError(
        "Invalid confidence field",
        index + 1,
        firstNonWhitespaceColumn(rawLine),
        rawLine.length + 1,
      );
    }
    if (fields.has(name)) {
      throw new ParseError(
        `Duplicate confidence field '${name}'`,
        index + 1,
        firstNonWhitespaceColumn(rawLine),
        rawLine.length + 1,
      );
    }
    fields.set(name, {
      value: line.slice(name.length).trim(),
      raw: rawLine,
      index,
    });
    index += 1;
  }
  return { fields, nextIndex: index };
}

function requireConfidenceFields(
  fields: Map<ConfidenceFieldName, ParsedConfidenceField>,
  rawHeader: string,
  startIndex: number,
): void {
  for (const required of CONFIDENCE_FIELD_NAMES) {
    if (!fields.has(required)) {
      throw new ParseError(
        `Confidence field '${required}' is required`,
        startIndex + 1,
        firstNonWhitespaceColumn(rawHeader),
        rawHeader.length + 1,
      );
    }
  }
}

function parseConfidenceRange(field: ParsedConfidenceField): [string, string] {
  const parts = field.value.split("..");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new ParseError(
      "Confidence range must use lower..upper syntax",
      field.index + 1,
      firstNonWhitespaceColumn(field.raw),
      field.raw.length + 1,
    );
  }
  return [parts[0], parts[1]];
}

function validateConfidenceEpistemic(field: ParsedConfidenceField): void {
  if (/^(known|estimated|unknown)$/.test(field.value)) return;
  throw new ParseError(
    "Confidence epistemic value must be known, estimated, or unknown",
    field.index + 1,
    firstNonWhitespaceColumn(field.raw),
    field.raw.length + 1,
  );
}

function parseExplicitConfidence(
  parsedHeader: ParsedConfidenceHeader,
  fields: Map<ConfidenceFieldName, ParsedConfidenceField>,
  nextIndex: number,
  rawHeader: string,
  startIndex: number,
): [ConfidenceDecl, number] {
  requireConfidenceFields(fields, rawHeader, startIndex);
  const estimateField = fields.get("estimate")!;
  const rangeField = fields.get("range")!;
  const epistemicField = fields.get("epistemic")!;
  const [lower, upper] = parseConfidenceRange(rangeField);
  validateConfidenceEpistemic(epistemicField);

  try {
    const assessment = createConfidenceAssessment({
      lower: parseUnitRational(lower),
      estimate: parseUnitRational(estimateField.value),
      upper: parseUnitRational(upper),
      epistemicTag: epistemicField.value as ConfidenceEpistemicTag,
      origin: "explicit",
    });
    return [
      {
        ...parsedHeader,
        assessment,
        syntax: "explicit",
        span: span(startIndex + 1, firstNonWhitespaceColumn(rawHeader)),
      },
      nextIndex,
    ];
  } catch (error) {
    if (error instanceof ConfidenceValueError) {
      throw confidenceParseError(error, rawHeader, startIndex);
    }
    throw error;
  }
}

function parseConfidence(
  lines: string[],
  startIndex: number,
): [ConfidenceDecl, number] {
  const rawHeader = lines[startIndex] ?? "";
  const parsedHeader = parseConfidenceHeader(rawHeader.trim());
  if (!parsedHeader) {
    throw new ParseError(
      "Invalid confidence declaration",
      startIndex + 1,
      firstNonWhitespaceColumn(rawHeader),
      rawHeader.length + 1,
    );
  }

  const headerIndent = currentIndent(rawHeader);
  const bodyIndex = nextSignificantLineIndex(lines, startIndex + 1);
  const rawBody = lines[bodyIndex] ?? "";
  if (currentIndent(rawBody) <= headerIndent) {
    throw new ParseError(
      "Confidence body is required",
      bodyIndex + 1,
      firstNonWhitespaceColumn(rawBody),
      rawBody.length + 1,
    );
  }
  const expectedIndent = headerIndent + 2;
  if (currentIndent(rawBody) !== expectedIndent) {
    throw new ParseError(
      "Invalid confidence field indentation",
      bodyIndex + 1,
      firstNonWhitespaceColumn(rawBody),
      rawBody.length + 1,
    );
  }

  if (rawBody.trim() === "default") {
    return parseDefaultConfidence(
      lines,
      bodyIndex,
      headerIndent,
      parsedHeader,
      rawHeader,
      startIndex,
    );
  }

  if (rawBody.trim().startsWith("keyword")) {
    return parseKeywordConfidence(
      lines,
      bodyIndex,
      headerIndent,
      parsedHeader,
      rawHeader,
      startIndex,
    );
  }

  const { fields, nextIndex } = collectConfidenceFields(
    lines,
    bodyIndex,
    headerIndent,
    expectedIndent,
  );
  return parseExplicitConfidence(
    parsedHeader,
    fields,
    nextIndex,
    rawHeader,
    startIndex,
  );
}

function parseFramework(
  lines: string[],
  startIndex: number,
): [FrameworkDecl, number] {
  const header = lines[startIndex]?.trim() ?? "";
  const rawHeader = lines[startIndex] ?? "";
  const match = /^framework\s+([A-Za-z][A-Za-z0-9_-]*)(:)?$/.exec(header);
  if (!match) {
    throw new ParseError(
      "Invalid framework declaration",
      startIndex + 1,
      firstNonWhitespaceColumn(rawHeader),
      rawHeader.length + 1,
    );
  }

  const rules: FrameworkRule[] = [];
  let index = startIndex + 1;
  if (match[2] === ":") {
    while (index < lines.length) {
      const raw = lines[index] ?? "";
      if (!raw.trim() || isCommentLine(raw)) {
        index += 1;
        continue;
      }
      if (currentIndent(raw) < 2) {
        break;
      }
      const parsedRule = parseFrameworkRuleLine(raw.trim());
      if (!parsedRule) {
        throw new ParseError(
          "Invalid framework rule",
          index + 1,
          firstNonWhitespaceColumn(raw),
          raw.length + 1,
        );
      }
      rules.push({ ...parsedRule, span: span(index + 1) });
      index += 1;
    }
  }

  return [
    {
      name: match[1],
      rules,
      span: span(startIndex + 1),
    },
    index,
  ];
}

function parseBlockText(
  lines: string[],
  markerIndex: number,
  markerIndent: number,
  errorMessage: string,
): { text: string; body: TextBody; nextIndex: number } {
  const collected: string[] = [];
  let contentIndent: number | undefined;
  let index = markerIndex + 1;

  while (index < lines.length) {
    const rawLine = lines[index] ?? "";
    const trimmedLine = rawLine.trim();
    const indent = currentIndent(rawLine);

    if (trimmedLine && indent <= markerIndent) {
      break;
    }

    if (!trimmedLine) {
      collected.push("");
      index += 1;
      continue;
    }

    contentIndent =
      contentIndent === undefined ? indent : Math.min(contentIndent, indent);
    collected.push(rawLine);
    index += 1;
  }

  const normalizedLines = trimBlankLines(
    collected.map((rawLine) => {
      if (!rawLine.trim()) {
        return "";
      }
      return rawLine.slice(contentIndent ?? 0);
    }),
  );

  if (normalizedLines.length === 0) {
    const rawMarkerLine = lines[markerIndex] ?? "";
    throw new ParseError(
      errorMessage,
      markerIndex + 1,
      tokenColumn(rawMarkerLine, "|"),
      rawMarkerLine.length + 1,
    );
  }

  return {
    text: normalizedLines.join("\n"),
    body: {
      syntax: "block",
      span: span(markerIndex + 1, tokenColumn(lines[markerIndex] ?? "", "|")),
      lineCount: normalizedLines.length,
    },
    nextIndex: index,
  };
}

function parseIndentedTextBody(
  lines: string[],
  headerIndex: number,
  errorMessage: string,
): { text: string; body: TextBody; nextIndex: number } {
  const valueIndex = nextSignificantLineIndex(lines, headerIndex + 1);
  const rawValueLine = lines[valueIndex] ?? "";
  const valueIndent = currentIndent(rawValueLine);
  const valueLine = rawValueLine.trim() ?? "";
  const headerIndent = currentIndent(lines[headerIndex] ?? "");

  if (valueIndent <= headerIndent) {
    throw new ParseError(
      errorMessage,
      valueIndex + 1,
      firstNonWhitespaceColumn(rawValueLine),
      rawValueLine.length + 1,
    );
  }

  if (valueLine.startsWith('"')) {
    return {
      text: stripQuotes(valueLine),
      body: {
        syntax: "quoted",
        span: span(valueIndex + 1, firstNonWhitespaceColumn(rawValueLine)),
        lineCount: 1,
      },
      nextIndex: valueIndex + 1,
    };
  }

  if (valueLine === "|") {
    return parseBlockText(lines, valueIndex, valueIndent, errorMessage);
  }

  throw new ParseError(
    errorMessage,
    valueIndex + 1,
    firstNonWhitespaceColumn(rawValueLine),
    rawValueLine.length + 1,
  );
}

function parseDescriptionBody(
  lines: string[],
  lineIndex: number,
): { text: string; body: TextBody; nextIndex: number } {
  const rawLine = lines[lineIndex] ?? "";
  const line = rawLine.trim() ?? "";
  const quotedMatch = /^description\s+(".*")$/.exec(line);
  if (quotedMatch) {
    return {
      text: stripQuotes(quotedMatch[1]),
      body: {
        syntax: "quoted",
        span: span(lineIndex + 1, tokenColumn(rawLine, "description")),
        lineCount: 1,
      },
      nextIndex: lineIndex + 1,
    };
  }

  if (line === "description |") {
    return parseBlockText(
      lines,
      lineIndex,
      currentIndent(rawLine),
      "Domain description is required",
    );
  }

  throw new ParseError(
    "Domain description is required",
    lineIndex + 1,
    firstNonWhitespaceColumn(rawLine),
    rawLine.length + 1,
  );
}

function parseDomain(
  lines: string[],
  startIndex: number,
): [DomainDecl, number] {
  const header = lines[startIndex]?.trim() ?? "";
  const rawHeader = lines[startIndex] ?? "";
  const match = /^domain\s+([A-Za-z][A-Za-z0-9_-]*):$/.exec(header);
  if (!match) {
    throw new ParseError(
      "Invalid domain declaration",
      startIndex + 1,
      firstNonWhitespaceColumn(rawHeader),
      rawHeader.length + 1,
    );
  }
  const descriptionIndex = nextSignificantLineIndex(lines, startIndex + 1);
  const { text, body, nextIndex } = parseDescriptionBody(
    lines,
    descriptionIndex,
  );
  return [
    {
      name: match[1],
      description: text,
      descriptionBody: body,
      span: span(startIndex + 1, firstNonWhitespaceColumn(rawHeader)),
    },
    nextIndex,
  ];
}

function parseProblem(
  lines: string[],
  startIndex: number,
): [ProblemDecl, number] {
  const header = lines[startIndex]?.trim() ?? "";
  const rawHeader = lines[startIndex] ?? "";
  const match = /^problem\s+([A-Za-z][A-Za-z0-9_-]*):$/.exec(header);
  if (!match) {
    throw new ParseError(
      "Invalid problem declaration",
      startIndex + 1,
      firstNonWhitespaceColumn(rawHeader),
      rawHeader.length + 1,
    );
  }
  const {
    text,
    body,
    nextIndex: textNextIndex,
  } = parseIndentedTextBody(lines, startIndex, "Problem text is required");
  const { annotations, nextIndex } = parseAnnotations(
    lines,
    textNextIndex,
    body.span.column - 1,
  );
  return [
    {
      name: match[1],
      text,
      textBody: body,
      annotations,
      span: span(startIndex + 1, firstNonWhitespaceColumn(rawHeader)),
    },
    nextIndex,
  ];
}

function parseStep(lines: string[], startIndex: number): [StepDecl, number] {
  const header = lines[startIndex]?.trim() ?? "";
  const rawHeader = lines[startIndex] ?? "";
  const parsedHeader = parseStepHeader(header);
  if (!parsedHeader.valid) {
    throw new ParseError(
      "Invalid step declaration",
      startIndex + 1,
      firstNonWhitespaceColumn(rawHeader),
      rawHeader.length + 1,
    );
  }

  const statementIndex = nextSignificantLineIndex(lines, startIndex + 1);
  const statementLine = lines[statementIndex]?.trim() ?? "";
  const statement = parseStatement(lines, statementIndex, statementLine);
  return [
    {
      id: parsedHeader.id ?? synthesizeStepId(statement.id),
      statement,
      span: span(startIndex + 1, firstNonWhitespaceColumn(rawHeader)),
      syntax: {
        step: "explicit",
        stepId: parsedHeader.id ? "explicit" : "synthetic",
      },
    },
    statement.nextIndex,
  ];
}

function parseStatement(
  lines: string[],
  lineIndex: number,
  line: string,
): StepStatement & { nextIndex: number } {
  if (line.startsWith("premise ")) {
    return parseTextStatement(
      "premise",
      lines,
      lineIndex,
    ) as PremiseStatement & { nextIndex: number };
  }
  if (line.startsWith("evidence ")) {
    return parseEvidenceStatement(lines, lineIndex);
  }
  if (line.startsWith("pending ")) {
    return parseTextStatement(
      "pending",
      lines,
      lineIndex,
    ) as PendingStatement & { nextIndex: number };
  }
  if (line.startsWith("viewpoint ")) {
    return parseViewpoint(lines, lineIndex);
  }
  if (line.startsWith("partition ")) {
    return parsePartition(lines, lineIndex);
  }
  if (line.startsWith("decision ")) {
    return parseDecision(lines, lineIndex);
  }
  if (line.startsWith("comparison ")) {
    return parseComparison(lines, lineIndex);
  }
  throw new ParseError(
    "Unknown statement type",
    lineIndex + 1,
    firstNonWhitespaceColumn(lines[lineIndex] ?? ""),
    (lines[lineIndex] ?? "").length + 1,
  );
}

function parseTextStatement<T extends "premise" | "pending">(
  role: T,
  lines: string[],
  startIndex: number,
): {
  role: T;
  id: string;
  text: string;
  textBody: TextBody;
  annotations: Annotation[];
  span: SourceSpan;
} & {
  nextIndex: number;
} {
  const header = lines[startIndex]?.trim() ?? "";
  const rawHeader = lines[startIndex] ?? "";
  const id = parseIdentifierAfterKeyword(header, role);
  if (!id) {
    throw new ParseError(
      `Invalid ${role} declaration`,
      startIndex + 1,
      firstNonWhitespaceColumn(rawHeader),
      rawHeader.length + 1,
    );
  }
  const {
    text,
    body,
    nextIndex: textNextIndex,
  } = parseIndentedTextBody(lines, startIndex, `${role} text is required`);
  const { annotations, nextIndex } = parseAnnotations(
    lines,
    textNextIndex,
    body.span.column - 1,
  );
  return {
    role,
    id,
    text,
    textBody: body,
    annotations,
    span: span(startIndex + 1, firstNonWhitespaceColumn(rawHeader)),
    nextIndex,
  };
}

function parseEvidenceStatement(
  lines: string[],
  startIndex: number,
): EvidenceStatement & { nextIndex: number } {
  const rawHeader = lines[startIndex] ?? "";
  const id = parseIdentifierAfterKeyword(rawHeader.trim(), "evidence");
  if (!id) {
    throw new ParseError(
      "Invalid evidence declaration",
      startIndex + 1,
      firstNonWhitespaceColumn(rawHeader),
      rawHeader.length + 1,
    );
  }
  const {
    text,
    body,
    nextIndex: textNextIndex,
  } = parseIndentedTextBody(lines, startIndex, "evidence text is required");
  const { resources, annotations, nextIndex } = parseEvidenceChildren(
    lines,
    textNextIndex,
    body.span.column - 1,
  );
  return {
    role: "evidence",
    id,
    text,
    textBody: body,
    resources,
    annotations,
    span: span(startIndex + 1, firstNonWhitespaceColumn(rawHeader)),
    nextIndex,
  };
}

function parseViewpoint(
  lines: string[],
  startIndex: number,
): ViewpointStatement & { nextIndex: number } {
  const header = lines[startIndex]?.trim() ?? "";
  const rawHeader = lines[startIndex] ?? "";
  const match = /^viewpoint\s+([A-Za-z][A-Za-z0-9_-]*):$/.exec(header);
  if (!match) {
    throw new ParseError(
      "Invalid viewpoint declaration",
      startIndex + 1,
      firstNonWhitespaceColumn(rawHeader),
      rawHeader.length + 1,
    );
  }
  const axisIndex = nextSignificantLineIndex(lines, startIndex + 1);
  const rawAxisLine = lines[axisIndex] ?? "";
  const axisLine = rawAxisLine.trim() ?? "";
  const axisMatch = /^axis\s+([A-Za-z][A-Za-z0-9_-]*)$/.exec(axisLine);
  if (!axisMatch) {
    throw new ParseError(
      "Viewpoint axis is required",
      axisIndex + 1,
      firstNonWhitespaceColumn(rawAxisLine),
      rawAxisLine.length + 1,
    );
  }
  return {
    role: "viewpoint",
    id: match[1],
    axis: axisMatch[1],
    span: span(startIndex + 1, firstNonWhitespaceColumn(rawHeader)),
    nextIndex: axisIndex + 1,
  };
}

function parsePartition(
  lines: string[],
  startIndex: number,
): PartitionStatement & { nextIndex: number } {
  const header = lines[startIndex]?.trim() ?? "";
  const rawHeader = lines[startIndex] ?? "";
  const match =
    /^partition\s+([A-Za-z][A-Za-z0-9_-]*)\s+on\s+([A-Za-z][A-Za-z0-9_-]*)\s+axis\s+([A-Za-z][A-Za-z0-9_-]*):$/.exec(
      header,
    );
  if (!match) {
    throw new ParseError(
      "Invalid partition declaration",
      startIndex + 1,
      firstNonWhitespaceColumn(rawHeader),
      rawHeader.length + 1,
    );
  }
  const members: PartitionMember[] = [];
  let index = startIndex + 1;
  while (index < lines.length) {
    const raw = lines[index] ?? "";
    if (!raw.trim() || isCommentLine(raw)) {
      index += 1;
      continue;
    }
    if (currentIndent(raw) < 4) {
      break;
    }
    const member = parsePartitionMemberLine(raw.trim());
    if (!member) {
      throw new ParseError(
        "Invalid partition member",
        index + 1,
        firstNonWhitespaceColumn(raw),
        raw.length + 1,
      );
    }
    members.push(member);
    index += 1;
  }
  return {
    role: "partition",
    id: match[1],
    domainName: match[2],
    axis: match[3],
    members,
    span: span(startIndex + 1, firstNonWhitespaceColumn(rawHeader)),
    nextIndex: index,
  };
}

function parseDecision(
  lines: string[],
  startIndex: number,
): DecisionStatement & { nextIndex: number } {
  const header = lines[startIndex]?.trim() ?? "";
  const rawHeader = lines[startIndex] ?? "";
  const parsedHeader = parseDecisionHeader(header);
  if (!parsedHeader) {
    throw new ParseError(
      "Invalid decision declaration",
      startIndex + 1,
      firstNonWhitespaceColumn(rawHeader),
      rawHeader.length + 1,
    );
  }
  const {
    text,
    body,
    nextIndex: textNextIndex,
  } = parseIndentedTextBody(lines, startIndex, "Decision text is required");
  const { annotations, nextIndex } = parseAnnotations(
    lines,
    textNextIndex,
    body.span.column - 1,
  );
  return {
    role: "decision",
    id: parsedHeader.id,
    basedOn: parsedHeader.basedOn,
    text,
    textBody: body,
    annotations,
    span: span(startIndex + 1, firstNonWhitespaceColumn(rawHeader)),
    nextIndex,
  };
}

function parseComparison(
  lines: string[],
  startIndex: number,
): ComparisonStatement & { nextIndex: number } {
  const header = lines[startIndex]?.trim() ?? "";
  const rawHeader = lines[startIndex] ?? "";
  const parsedHeader = parseComparisonHeader(header);
  if (!parsedHeader) {
    throw new ParseError(
      "Invalid comparison declaration",
      startIndex + 1,
      firstNonWhitespaceColumn(rawHeader),
      rawHeader.length + 1,
    );
  }
  const {
    text,
    body,
    nextIndex: textNextIndex,
  } = parseIndentedTextBody(lines, startIndex, "Comparison text is required");
  const { annotations, nextIndex } = parseAnnotations(
    lines,
    textNextIndex,
    body.span.column - 1,
  );
  return {
    role: "comparison",
    id: parsedHeader.id,
    problemId: parsedHeader.problemId,
    viewpointId: parsedHeader.viewpointId,
    relation: parsedHeader.relation,
    leftDecisionId: parsedHeader.leftDecisionId,
    rightDecisionId: parsedHeader.rightDecisionId,
    text,
    textBody: body,
    annotations,
    span: span(startIndex + 1, firstNonWhitespaceColumn(rawHeader)),
    nextIndex,
  };
}

function parseQuery(lines: string[], startIndex: number): [QueryDecl, number] {
  const header = lines[startIndex]?.trim() ?? "";
  const rawHeader = lines[startIndex] ?? "";
  const match = /^query\s+([A-Za-z][A-Za-z0-9_-]*):$/.exec(header);
  if (!match) {
    throw new ParseError(
      "Invalid query declaration",
      startIndex + 1,
      firstNonWhitespaceColumn(rawHeader),
      rawHeader.length + 1,
    );
  }
  const expressionIndex = nextSignificantLineIndex(lines, startIndex + 1);
  const rawExpressionLine = lines[expressionIndex] ?? "";
  const expressionLine = rawExpressionLine.trim() ?? "";
  if (!expressionLine) {
    throw new ParseError(
      "Query expression is required",
      expressionIndex + 1,
      firstNonWhitespaceColumn(rawExpressionLine),
      rawExpressionLine.length + 1,
    );
  }
  return [
    {
      id: match[1],
      expression: expressionLine,
      span: span(startIndex + 1, firstNonWhitespaceColumn(rawHeader)),
      expressionSpan: span(
        expressionIndex + 1,
        firstNonWhitespaceColumn(rawExpressionLine),
      ),
    },
    expressionIndex + 1,
  ];
}
