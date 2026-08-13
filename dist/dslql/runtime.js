import { createDocumentDeclarationIndex, } from "../model/declarations.js";
import { DslqlEvaluationError, } from "./evaluator.js";
import { assertDslqlFunctionImplementationCoverage } from "./functions.js";
function normalizeSpan(span) {
    return { line: span.line, column: span.column };
}
function normalizeTextBody(body) {
    return {
        syntax: body.syntax,
        span: normalizeSpan(body.span),
        line_count: body.lineCount,
    };
}
function normalizeAnnotation(annotation) {
    return {
        node_kind: "annotation",
        annotation_kind: annotation.kind,
        text: annotation.text,
        body: normalizeTextBody(annotation.body),
        span: normalizeSpan(annotation.span),
    };
}
function textStatementFields(statement) {
    return {
        text: statement.text,
        text_body: normalizeTextBody(statement.textBody),
        annotations: statement.annotations.map(normalizeAnnotation),
    };
}
function normalizeStatement(statement) {
    const common = {
        node_kind: "statement",
        role: statement.role,
        id: statement.id,
        span: normalizeSpan(statement.span),
    };
    switch (statement.role) {
        case "premise":
        case "evidence":
        case "pending":
            return { ...common, ...textStatementFields(statement) };
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
function normalizeDocument(document) {
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
function asObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? value
        : undefined;
}
function stringField(value, field) {
    const candidate = asObject(value)?.[field];
    return typeof candidate === "string" ? candidate : undefined;
}
function statementFrom(value) {
    const object = asObject(value);
    if (object?.node_kind === "statement")
        return object;
    const statement = object?.statement;
    const normalized = statement ? asObject(statement) : undefined;
    return normalized?.node_kind === "statement" ? normalized : undefined;
}
function referenceIds(node) {
    const role = stringField(node, "role");
    if (role === "decision") {
        const refs = node.based_on;
        return Array.isArray(refs)
            ? refs.filter((value) => typeof value === "string")
            : [];
    }
    if (role === "comparison") {
        return [
            node.problem_id,
            node.viewpoint_id,
            node.left_decision_id,
            node.right_decision_id,
        ].filter((value) => typeof value === "string");
    }
    if (role === "partition") {
        return typeof node.domain_id === "string" ? [node.domain_id] : [];
    }
    return [];
}
function normalizedDeclarationsByKind(document) {
    const domains = document.domains;
    const problems = document.problems;
    const steps = document.steps;
    const queries = document.queries;
    const statements = steps
        .map(statementFrom)
        .filter((value) => Boolean(value));
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
function buildRelationIndex(documentAst, document) {
    const declarationIndex = createDocumentDeclarationIndex(documentAst);
    const normalizedByKind = normalizedDeclarationsByKind(document);
    const nodes = new Map();
    for (const declaration of declarationIndex.declarations) {
        const value = normalizedByKind[declaration.kind].find((candidate) => stringField(candidate, "id") === declaration.id);
        if (!value) {
            throw new Error(`Normalized ${declaration.kind} '${declaration.id}' is missing`);
        }
        nodes.set(declaration.id, value);
    }
    const statements = normalizedByKind.statement.filter((value) => Boolean(asObject(value)));
    const reverse = new Map();
    for (const statement of statements) {
        const statementId = stringField(statement, "id");
        if (!statementId)
            continue;
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
function uniqueValues(values) {
    const seen = new Set();
    return values.filter((value) => {
        const id = stringField(value, "id") ?? JSON.stringify(value);
        if (seen.has(id))
            return false;
        seen.add(id);
        return true;
    });
}
function inputIds(input) {
    return input
        .map((value) => typeof value === "string"
        ? value
        : stringField(statementFrom(value) ?? value, "id"))
        .filter((value) => Boolean(value));
}
function traverseRelations(initialIds, nextIds, index) {
    const visited = new Set(initialIds);
    const queue = [...initialIds];
    const output = [];
    while (queue.length > 0) {
        const current = queue.shift();
        for (const next of nextIds(current)) {
            if (visited.has(next))
                continue;
            visited.add(next);
            queue.push(next);
            const node = index.nodes.get(next);
            if (node)
                output.push(node);
        }
    }
    return output;
}
function containsPending(value) {
    if (Array.isArray(value))
        return value.some(containsPending);
    const object = asObject(value);
    if (!object)
        return false;
    if (object.role === "pending")
        return true;
    return Object.values(object).some(containsPending);
}
function singleStringArgument(context, name) {
    if (context.arguments.length === 0)
        return undefined;
    if (context.arguments.length !== 1) {
        throw new DslqlEvaluationError(`${name}() expects zero or one argument`);
    }
    const scope = context.input.length > 0 ? context.input : [context.runtime.root];
    const values = context.evaluate(context.arguments[0], scope.slice(0, 1));
    if (values.length !== 1 || typeof values[0] !== "string") {
        throw new DslqlEvaluationError(`${name}() argument must be one string`);
    }
    return values[0];
}
function requireNoArguments(context, name) {
    if (context.arguments.length !== 0) {
        throw new DslqlEvaluationError(`${name}() expects no arguments`);
    }
}
function findingsFrom(value) {
    const results = asObject(value)?.results;
    return Array.isArray(results) ? results : [];
}
function severityAtLeast(value, minimum) {
    const order = ["hint", "info", "warning", "error", "fatal"];
    const severity = stringField(value, "severity");
    return Boolean(severity &&
        order.includes(severity) &&
        order.indexOf(severity) >= order.indexOf(minimum));
}
function createRelationFunctions(index) {
    const functions = {
        related_decisions: (context) => {
            requireNoArguments(context, "related_decisions");
            const { input } = context;
            const targets = new Set(inputIds(input));
            return index.decisions.filter((decision) => {
                const id = stringField(decision, "id");
                if (!id)
                    return false;
                const upstream = traverseRelations([id], (candidate) => {
                    const node = index.nodes.get(candidate);
                    const object = node
                        ? (statementFrom(node) ?? asObject(node))
                        : undefined;
                    return object ? referenceIds(object) : [];
                }, index);
                return upstream.some((node) => {
                    const upstreamId = stringField(node, "id");
                    return upstreamId ? targets.has(upstreamId) : false;
                });
            });
        },
        based_on_refs: (context) => {
            requireNoArguments(context, "based_on_refs");
            return uniqueValues(context.input.flatMap((value) => {
                const statement = statementFrom(value);
                return statement?.role === "decision"
                    ? referenceIds(statement)
                        .map((id) => index.nodes.get(id))
                        .filter((node) => node !== undefined)
                    : [];
            }));
        },
        upstream: (context) => {
            requireNoArguments(context, "upstream");
            return traverseRelations(inputIds(context.input), (id) => {
                const value = index.nodes.get(id);
                const object = value
                    ? (statementFrom(value) ?? asObject(value))
                    : undefined;
                return object ? referenceIds(object) : [];
            }, index);
        },
        downstream: (context) => {
            requireNoArguments(context, "downstream");
            return traverseRelations(inputIds(context.input), (id) => index.reverse.get(id) ?? [], index);
        },
    };
    assertDslqlFunctionImplementationCoverage(["relation"], Object.keys(functions));
    return functions;
}
function createContextFunctions() {
    const functions = {
        audit_findings: (context) => {
            const minimum = singleStringArgument(context, "audit_findings");
            const findings = context.input.flatMap(findingsFrom);
            if (!minimum)
                return findings;
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
                    throw new DslqlEvaluationError("score() input must have a numeric score field");
                }
                return score;
            });
        },
    };
    assertDslqlFunctionImplementationCoverage(["context"], Object.keys(functions));
    return functions;
}
export function createDocumentDslqlRuntime(documentAst, options = {}) {
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
export function documentAstToDslqlValue(document) {
    return normalizeDocument(document);
}
//# sourceMappingURL=runtime.js.map