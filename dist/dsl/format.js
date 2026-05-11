import { parseDocument } from "../parser/parser.js";
function quote(value) {
    return JSON.stringify(value);
}
function indent(line) {
    return `  ${line}`;
}
function formatTextBody(text, body) {
    const useBlock = body?.syntax === "block" || text.includes("\n");
    if (!useBlock) {
        return [quote(text)];
    }
    return ["|", ...text.split("\n").map(indent)];
}
function formatAnnotations(annotations) {
    return annotations.flatMap((annotation) => [
        `annotation ${annotation.kind}:`,
        ...formatTextBody(annotation.text, annotation.body).map(indent),
    ]);
}
function formatFramework(framework) {
    if (framework.rules.length === 0) {
        return `framework ${framework.name}`;
    }
    return [
        `framework ${framework.name}:`,
        ...framework.rules.map((rule) => indent(`${rule.kind} ${rule.value}`)),
    ].join("\n");
}
function formatQuotedStepBody(keyword, statement) {
    return [
        `${keyword} ${statement.id}:`,
        ...formatTextBody(statement.text, statement.textBody).map(indent),
        ...formatAnnotations(statement.annotations).map(indent),
    ];
}
function formatDecision(statement) {
    const basedOn = statement.basedOn.length > 0
        ? ` based_on ${statement.basedOn.join(", ")}`
        : "";
    return [
        `decision ${statement.id}${basedOn}:`,
        ...formatTextBody(statement.text, statement.textBody).map(indent),
        ...formatAnnotations(statement.annotations).map(indent),
    ];
}
function formatComparison(statement) {
    return [
        `comparison ${statement.id} on ${statement.problemId} viewpoint ${statement.viewpointId} relation ${statement.relation} ${statement.leftDecisionId}, ${statement.rightDecisionId}:`,
        ...formatTextBody(statement.text, statement.textBody).map(indent),
        ...formatAnnotations(statement.annotations).map(indent),
    ];
}
function formatViewpoint(statement) {
    return [`viewpoint ${statement.id}:`, indent(`axis ${statement.axis}`)];
}
function formatStepBody(step) {
    switch (step.statement.role) {
        case "premise":
            return formatQuotedStepBody("premise", step.statement);
        case "evidence":
            return formatQuotedStepBody("evidence", step.statement);
        case "pending":
            return formatQuotedStepBody("pending", step.statement);
        case "decision":
            return formatDecision(step.statement);
        case "comparison":
            return formatComparison(step.statement);
        case "viewpoint":
            return formatViewpoint(step.statement);
        case "partition":
            return [
                `partition ${step.statement.id} on ${step.statement.domainName} axis ${step.statement.axis}:`,
                ...step.statement.members.map((member) => indent(`${member.name} := ${member.predicate}`)),
            ];
    }
}
function formatStep(step) {
    const bodyLines = formatStepBody(step);
    if (step.syntax.step === "implicit") {
        return bodyLines.join("\n");
    }
    const header = step.syntax.stepId === "explicit" ? `step ${step.id}:` : "step:";
    return [header, ...bodyLines.map(indent)].join("\n");
}
function formatQuery(query) {
    return [`query ${query.id}:`, indent(query.expression)].join("\n");
}
export function formatDocument(document) {
    const sections = [];
    if (document.framework) {
        sections.push(formatFramework(document.framework));
    }
    sections.push(...document.domains.map((domain) => [
        `domain ${domain.name}:`,
        ...(() => {
            if (domain.descriptionBody.syntax === "block" || domain.description.includes("\n")) {
                return [indent("description |"), ...domain.description.split("\n").map((line) => indent(indent(line)))];
            }
            return [indent(`description ${quote(domain.description)}`)];
        })(),
    ].join("\n")));
    sections.push(...document.problems.map((problem) => [
        `problem ${problem.name}:`,
        ...formatTextBody(problem.text, problem.textBody).map(indent),
        ...formatAnnotations(problem.annotations).map(indent),
    ].join("\n")));
    sections.push(...document.steps.map(formatStep));
    sections.push(...document.queries.map(formatQuery));
    return `${sections.join("\n\n")}\n`;
}
export function formatDslText(input) {
    return formatDocument(parseDocument(input));
}
//# sourceMappingURL=format.js.map