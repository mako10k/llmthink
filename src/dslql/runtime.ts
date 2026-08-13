import type {
  Annotation,
  DocumentAst,
  EvidenceResource,
  SourceSpan,
  StepStatement,
  TextBody,
} from "../model/ast.js";
import {
  createDocumentDeclarationIndex,
  type DocumentDeclarationKind,
} from "../model/declarations.js";
import {
  DslqlEvaluationError,
  type DslqlFunction,
  type DslqlObject,
  type DslqlRuntime,
  type DslqlValue,
} from "./evaluator.js";
import { assertDslqlFunctionImplementationCoverage } from "./functions.js";

export interface DocumentDslqlRuntimeOptions {
  audit?: DslqlValue;
  thought?: DslqlValue;
  search?: DslqlValue[];
}

function normalizeSpan(span: SourceSpan): DslqlObject {
  return { line: span.line, column: span.column };
}

function normalizeTextBody(body: TextBody): DslqlObject {
  return {
    syntax: body.syntax,
    span: normalizeSpan(body.span),
    line_count: body.lineCount,
  };
}

function normalizeAnnotation(annotation: Annotation): DslqlObject {
  return {
    node_kind: "annotation",
    annotation_kind: annotation.kind,
    text: annotation.text,
    body: normalizeTextBody(annotation.body),
    span: normalizeSpan(annotation.span),
  };
}

function normalizeEvidenceResource(resource: EvidenceResource): DslqlObject {
  return {
    node_kind: "evidence_resource",
    locator_kind: resource.locator.kind,
    locator: resource.locator.value,
    digest: resource.digest
      ? `${resource.digest.algorithm}:${resource.digest.value}`
      : null,
    mime: resource.mime?.value ?? null,
    label: resource.label?.value ?? null,
    span: normalizeSpan(resource.span),
  };
}

function textStatementFields(
  statement: Extract<
    StepStatement,
    { role: "premise" | "evidence" | "decision" | "comparison" | "pending" }
  >,
): DslqlObject {
  return {
    text: statement.text,
    text_body: normalizeTextBody(statement.textBody),
    annotations: statement.annotations.map(normalizeAnnotation),
  };
}

function normalizeStatement(statement: StepStatement): DslqlObject {
  const common: DslqlObject = {
    node_kind: "statement",
    role: statement.role,
    id: statement.id,
    span: normalizeSpan(statement.span),
  };
  switch (statement.role) {
    case "premise":
    case "pending":
      return { ...common, ...textStatementFields(statement) };
    case "evidence":
      return {
        ...common,
        ...textStatementFields(statement),
        resources: statement.resources.map(normalizeEvidenceResource),
      };
    case "viewpoint":
      return { ...common, axis: statement.axis };
    case "partition":
      return {
        ...common,
        domain_id: statement.domainName,
        axis: statement.axis,
        members: statement.members.map((member) => ({
          name: member.name,
          predicate: member.predicate,
        })),
      };
    case "decision":
      return {
        ...common,
        ...textStatementFields(statement),
        based_on: statement.basedOn,
      };
    case "comparison":
      return {
        ...common,
        ...textStatementFields(statement),
        problem_id: statement.problemId,
        viewpoint_id: statement.viewpointId,
        relation: statement.relation,
        left_decision_id: statement.leftDecisionId,
        right_decision_id: statement.rightDecisionId,
      };
  }
}

function normalizeDocument(document: DocumentAst): DslqlObject {
  return {
    node_kind: "document",
    framework: document.framework
      ? {
          node_kind: "framework",
          id: document.framework.name,
          rules: document.framework.rules.map((rule) => ({
            node_kind: "framework_rule",
            rule_kind: rule.kind,
            value: rule.value,
            span: normalizeSpan(rule.span),
          })),
          span: normalizeSpan(document.framework.span),
        }
      : null,
    domains: document.domains.map((domain) => ({
      node_kind: "domain",
      id: domain.name,
      description: domain.description,
      description_body: normalizeTextBody(domain.descriptionBody),
      span: normalizeSpan(domain.span),
    })),
    problems: document.problems.map((problem) => ({
      node_kind: "problem",
      id: problem.name,
      text: problem.text,
      text_body: normalizeTextBody(problem.textBody),
      annotations: problem.annotations.map(normalizeAnnotation),
      span: normalizeSpan(problem.span),
    })),
    steps: document.steps.map((step) => ({
      node_kind: "step",
      id: step.id,
      statement: normalizeStatement(step.statement),
      syntax: {
        step: step.syntax.step,
        step_id: step.syntax.stepId,
      },
      span: normalizeSpan(step.span),
    })),
    queries: document.queries.map((query) => ({
      node_kind: "query",
      id: query.id,
      expression: query.expression,
      span: normalizeSpan(query.span),
      expression_span: normalizeSpan(query.expressionSpan),
    })),
  };
}

function asObject(value: DslqlValue): DslqlObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : undefined;
}

function stringField(value: DslqlValue, field: string): string | undefined {
  const candidate = asObject(value)?.[field];
  return typeof candidate === "string" ? candidate : undefined;
}

function statementFrom(value: DslqlValue): DslqlObject | undefined {
  const object = asObject(value);
  if (object?.node_kind === "statement") return object;
  const statement = object?.statement;
  const normalized = statement ? asObject(statement) : undefined;
  return normalized?.node_kind === "statement" ? normalized : undefined;
}

function referenceIds(node: DslqlObject): string[] {
  const role = stringField(node, "role");
  if (role === "decision") {
    const refs = node.based_on;
    return Array.isArray(refs)
      ? refs.filter((value): value is string => typeof value === "string")
      : [];
  }
  if (role === "comparison") {
    return [
      node.problem_id,
      node.viewpoint_id,
      node.left_decision_id,
      node.right_decision_id,
    ].filter((value): value is string => typeof value === "string");
  }
  if (role === "partition") {
    return typeof node.domain_id === "string" ? [node.domain_id] : [];
  }
  return [];
}

interface RelationIndex {
  nodes: Map<string, DslqlValue>;
  statements: DslqlObject[];
  decisions: DslqlObject[];
  reverse: Map<string, string[]>;
}

function normalizedDeclarationsByKind(
  document: DslqlObject,
): Record<DocumentDeclarationKind, DslqlValue[]> {
  const domains = document.domains as DslqlValue[];
  const problems = document.problems as DslqlValue[];
  const steps = document.steps as DslqlValue[];
  const queries = document.queries as DslqlValue[];
  const statements = steps
    .map(statementFrom)
    .filter((value): value is DslqlObject => Boolean(value));
  const framework = document.framework;
  return {
    framework: framework === null ? [] : [framework],
    domain: domains,
    problem: problems,
    step: steps,
    statement: statements,
    query: queries,
  };
}

function buildRelationIndex(
  documentAst: DocumentAst,
  document: DslqlObject,
): RelationIndex {
  const declarationIndex = createDocumentDeclarationIndex(documentAst);
  const normalizedByKind = normalizedDeclarationsByKind(document);
  const nodes = new Map<string, DslqlValue>();
  for (const declaration of declarationIndex.declarations) {
    const value = normalizedByKind[declaration.kind].find(
      (candidate) => stringField(candidate, "id") === declaration.id,
    );
    if (!value) {
      throw new Error(
        `Normalized ${declaration.kind} '${declaration.id}' is missing`,
      );
    }
    nodes.set(declaration.id, value);
  }

  const statements = normalizedByKind.statement.filter(
    (value): value is DslqlObject => Boolean(asObject(value)),
  ) as DslqlObject[];

  const reverse = new Map<string, string[]>();
  for (const statement of statements) {
    const statementId = stringField(statement, "id");
    if (!statementId) continue;
    for (const ref of referenceIds(statement)) {
      reverse.set(ref, [...(reverse.get(ref) ?? []), statementId]);
    }
  }
  return {
    nodes,
    statements,
    decisions: statements.filter((statement) => statement.role === "decision"),
    reverse,
  };
}

function uniqueValues(values: DslqlValue[]): DslqlValue[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const id = stringField(value, "id") ?? JSON.stringify(value);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function inputIds(input: readonly DslqlValue[]): string[] {
  return input
    .map((value) =>
      typeof value === "string"
        ? value
        : stringField(statementFrom(value) ?? value, "id"),
    )
    .filter((value): value is string => Boolean(value));
}

function traverseRelations(
  initialIds: string[],
  nextIds: (id: string) => string[],
  index: RelationIndex,
): DslqlValue[] {
  const visited = new Set(initialIds);
  const queue = [...initialIds];
  const output: DslqlValue[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of nextIds(current)) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
      const node = index.nodes.get(next);
      if (node) output.push(node);
    }
  }
  return output;
}

function containsPending(value: DslqlValue): boolean {
  if (Array.isArray(value)) return value.some(containsPending);
  const object = asObject(value);
  if (!object) return false;
  if (object.role === "pending") return true;
  return Object.values(object).some(containsPending);
}

function singleStringArgument(
  context: Parameters<DslqlFunction>[0],
  name: string,
): string | undefined {
  if (context.arguments.length === 0) return undefined;
  if (context.arguments.length !== 1) {
    throw new DslqlEvaluationError(`${name}() expects zero or one argument`);
  }
  const scope =
    context.input.length > 0 ? context.input : [context.runtime.root];
  const values = context.evaluate(context.arguments[0]!, scope.slice(0, 1));
  if (values.length !== 1 || typeof values[0] !== "string") {
    throw new DslqlEvaluationError(`${name}() argument must be one string`);
  }
  return values[0];
}

function requireNoArguments(
  context: Parameters<DslqlFunction>[0],
  name: string,
): void {
  if (context.arguments.length !== 0) {
    throw new DslqlEvaluationError(`${name}() expects no arguments`);
  }
}

function findingsFrom(value: DslqlValue): DslqlValue[] {
  const results = asObject(value)?.results;
  return Array.isArray(results) ? results : [];
}

function severityAtLeast(value: DslqlValue, minimum: string): boolean {
  const order = ["hint", "info", "warning", "error", "fatal"];
  const severity = stringField(value, "severity");
  return Boolean(
    severity &&
    order.includes(severity) &&
    order.indexOf(severity) >= order.indexOf(minimum),
  );
}

function createRelationFunctions(
  index: RelationIndex,
): Record<string, DslqlFunction> {
  const functions: Record<string, DslqlFunction> = {
    related_decisions: (context) => {
      requireNoArguments(context, "related_decisions");
      const { input } = context;
      const targets = new Set(inputIds(input));
      return index.decisions.filter((decision) => {
        const id = stringField(decision, "id");
        if (!id) return false;
        const upstream = traverseRelations(
          [id],
          (candidate) => {
            const node = index.nodes.get(candidate);
            const object = node
              ? (statementFrom(node) ?? asObject(node))
              : undefined;
            return object ? referenceIds(object) : [];
          },
          index,
        );
        return upstream.some((node) => {
          const upstreamId = stringField(node, "id");
          return upstreamId ? targets.has(upstreamId) : false;
        });
      });
    },
    based_on_refs: (context) => {
      requireNoArguments(context, "based_on_refs");
      return uniqueValues(
        context.input.flatMap((value) => {
          const statement = statementFrom(value);
          return statement?.role === "decision"
            ? referenceIds(statement)
                .map((id) => index.nodes.get(id))
                .filter((node): node is DslqlValue => node !== undefined)
            : [];
        }),
      );
    },
    upstream: (context) => {
      requireNoArguments(context, "upstream");
      return traverseRelations(
        inputIds(context.input),
        (id) => {
          const value = index.nodes.get(id);
          const object = value
            ? (statementFrom(value) ?? asObject(value))
            : undefined;
          return object ? referenceIds(object) : [];
        },
        index,
      );
    },
    downstream: (context) => {
      requireNoArguments(context, "downstream");
      return traverseRelations(
        inputIds(context.input),
        (id) => index.reverse.get(id) ?? [],
        index,
      );
    },
  };
  assertDslqlFunctionImplementationCoverage(
    ["relation"],
    Object.keys(functions),
  );
  return functions;
}

function createContextFunctions(): Record<string, DslqlFunction> {
  const functions: Record<string, DslqlFunction> = {
    audit_findings: (context) => {
      const minimum = singleStringArgument(context, "audit_findings");
      const findings = context.input.flatMap(findingsFrom);
      if (!minimum) return findings;
      if (!["fatal", "error", "warning", "info", "hint"].includes(minimum)) {
        throw new DslqlEvaluationError(`Unknown audit severity '${minimum}'`);
      }
      return findings.filter((finding) => severityAtLeast(finding, minimum));
    },
    has_open_pending: (context) => {
      requireNoArguments(context, "has_open_pending");
      return context.input.map(containsPending);
    },
    score: (context) => {
      requireNoArguments(context, "score");
      return context.input.map((value) => {
        const score = asObject(value)?.score;
        if (typeof score !== "number") {
          throw new DslqlEvaluationError(
            "score() input must have a numeric score field",
          );
        }
        return score;
      });
    },
  };
  assertDslqlFunctionImplementationCoverage(
    ["context"],
    Object.keys(functions),
  );
  return functions;
}

export function createDocumentDslqlRuntime(
  documentAst: DocumentAst,
  options: DocumentDslqlRuntimeOptions = {},
): DslqlRuntime {
  const document = normalizeDocument(documentAst);
  const relationIndex = buildRelationIndex(documentAst, document);
  return {
    root: {
      document,
      audit: options.audit ?? null,
      thought: options.thought ?? null,
      search: options.search ?? [],
    },
    functions: {
      ...createRelationFunctions(relationIndex),
      ...createContextFunctions(),
    },
  };
}

export function documentAstToDslqlValue(document: DocumentAst): DslqlValue {
  return normalizeDocument(document);
}
