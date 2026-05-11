function span(line, column = 1) {
    return { line, column };
}
function firstNonWhitespaceColumn(line) {
    const indent = currentIndent(line);
    return indent + 1;
}
function tokenColumn(line, token) {
    const index = line.indexOf(token);
    return (index >= 0 ? index : currentIndent(line)) + 1;
}
function stripQuotes(value) {
    return value.replace(/^"/, "").replace(/"$/, "");
}
function currentIndent(line) {
    return line.match(/^\s*/)?.[0].length ?? 0;
}
function isCommentLine(line) {
    return line.trimStart().startsWith("#");
}
function nextSignificantLineIndex(lines, startIndex) {
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
function parseIdentifierAfterKeyword(header, keyword) {
    const prefix = `${keyword} `;
    if (!header.startsWith(prefix) || !header.endsWith(":")) {
        return undefined;
    }
    const identifier = header.slice(prefix.length, -1).trim();
    return /^[A-Za-z][A-Za-z0-9_-]*$/.test(identifier) ? identifier : undefined;
}
function parseStepHeader(header) {
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
function synthesizeStepId(statementId) {
    return `S-${statementId}`;
}
function isStatementHeader(line) {
    return (line.startsWith("premise ") ||
        line.startsWith("evidence ") ||
        line.startsWith("pending ") ||
        line.startsWith("viewpoint ") ||
        line.startsWith("partition ") ||
        line.startsWith("comparison ") ||
        line.startsWith("decision "));
}
function implicitStepFromStatement(statement) {
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
function parsePartitionMemberLine(line) {
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
function parseAnnotationKind(header) {
    const match = /^annotation\s+(explanation|rationale|status|caveat|todo|orphan_future|orphan_reference):$/.exec(header);
    return match?.[1];
}
function parseAnnotations(lines, startIndex, expectedIndent) {
    const annotations = [];
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
                throw new ParseError("Invalid annotation declaration", index + 1, firstNonWhitespaceColumn(rawHeader), rawHeader.length + 1);
            }
            break;
        }
        const textIndex = nextSignificantLineIndex(lines, index + 1);
        const rawTextLine = lines[textIndex] ?? "";
        const textIndent = currentIndent(rawTextLine);
        const textLine = rawTextLine.trim() ?? "";
        if (!textLine.startsWith('"') || textIndent <= expectedIndent) {
            throw new ParseError("Annotation text is required", textIndex + 1, firstNonWhitespaceColumn(rawTextLine), rawTextLine.length + 1);
        }
        annotations.push({
            kind,
            text: stripQuotes(textLine),
            span: span(index + 1, firstNonWhitespaceColumn(rawHeader)),
        });
        index = textIndex + 1;
    }
    return { annotations, nextIndex: index };
}
function parseDecisionHeader(header) {
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
function parseComparisonHeader(header) {
    const match = /^comparison\s+([A-Za-z][A-Za-z0-9_-]*)\s+on\s+([A-Za-z][A-Za-z0-9_-]*)\s+viewpoint\s+([A-Za-z][A-Za-z0-9_-]*)\s+relation\s+(preferred_over|weaker_than|incomparable|counterexample_to)\s+([A-Za-z][A-Za-z0-9_-]*)\s*,\s*([A-Za-z][A-Za-z0-9_-]*):$/.exec(header);
    if (!match) {
        return undefined;
    }
    return {
        id: match[1],
        problemId: match[2],
        viewpointId: match[3],
        relation: match[4],
        leftDecisionId: match[5],
        rightDecisionId: match[6],
    };
}
function parseFrameworkRuleLine(line) {
    const separatorIndex = line.indexOf(" ");
    if (separatorIndex <= 0) {
        return undefined;
    }
    const kind = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (!value || !["requires", "forbids", "warns"].includes(kind)) {
        return undefined;
    }
    return { kind: kind, value, span: span(0) };
}
export class ParseError extends Error {
    line;
    column;
    endColumn;
    constructor(message, line, column = 1, endColumn = column) {
        super(`${message} at line ${line}`);
        this.line = line;
        this.column = column;
        this.endColumn = endColumn;
    }
}
export function parseDocument(input) {
    const lines = input.replace(/\r\n/g, "\n").split("\n");
    const document = {
        domains: [],
        problems: [],
        steps: [],
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
        if (line.startsWith("query ")) {
            const [query, nextIndex] = parseQuery(lines, index);
            document.queries.push(query);
            index = nextIndex;
            continue;
        }
        throw new ParseError(`Unexpected top-level statement: ${line}`, index + 1, firstNonWhitespaceColumn(rawLine), rawLine.length + 1);
    }
    return document;
}
function parseFramework(lines, startIndex) {
    const header = lines[startIndex]?.trim() ?? "";
    const rawHeader = lines[startIndex] ?? "";
    const match = /^framework\s+([A-Za-z][A-Za-z0-9_-]*)(:)?$/.exec(header);
    if (!match) {
        throw new ParseError("Invalid framework declaration", startIndex + 1, firstNonWhitespaceColumn(rawHeader), rawHeader.length + 1);
    }
    const rules = [];
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
                throw new ParseError("Invalid framework rule", index + 1, firstNonWhitespaceColumn(raw), raw.length + 1);
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
function parseDomain(lines, startIndex) {
    const header = lines[startIndex]?.trim() ?? "";
    const rawHeader = lines[startIndex] ?? "";
    const match = /^domain\s+([A-Za-z][A-Za-z0-9_-]*):$/.exec(header);
    if (!match) {
        throw new ParseError("Invalid domain declaration", startIndex + 1, firstNonWhitespaceColumn(rawHeader), rawHeader.length + 1);
    }
    const descriptionIndex = nextSignificantLineIndex(lines, startIndex + 1);
    const rawDescriptionLine = lines[descriptionIndex] ?? "";
    const descriptionLine = rawDescriptionLine.trim() ?? "";
    const descriptionMatch = /^description\s+"(.+)"$/.exec(descriptionLine);
    if (!descriptionMatch) {
        throw new ParseError("Domain description is required", descriptionIndex + 1, firstNonWhitespaceColumn(rawDescriptionLine), rawDescriptionLine.length + 1);
    }
    return [
        {
            name: match[1],
            description: descriptionMatch[1],
            span: span(startIndex + 1, firstNonWhitespaceColumn(rawHeader)),
        },
        descriptionIndex + 1,
    ];
}
function parseProblem(lines, startIndex) {
    const header = lines[startIndex]?.trim() ?? "";
    const rawHeader = lines[startIndex] ?? "";
    const match = /^problem\s+([A-Za-z][A-Za-z0-9_-]*):$/.exec(header);
    if (!match) {
        throw new ParseError("Invalid problem declaration", startIndex + 1, firstNonWhitespaceColumn(rawHeader), rawHeader.length + 1);
    }
    const textIndex = nextSignificantLineIndex(lines, startIndex + 1);
    const rawTextLine = lines[textIndex] ?? "";
    const textLine = rawTextLine.trim() ?? "";
    if (!textLine.startsWith('"')) {
        throw new ParseError("Problem text is required", textIndex + 1, firstNonWhitespaceColumn(rawTextLine), rawTextLine.length + 1);
    }
    const { annotations, nextIndex } = parseAnnotations(lines, textIndex + 1, currentIndent(rawTextLine));
    return [
        {
            name: match[1],
            text: stripQuotes(textLine),
            annotations,
            span: span(startIndex + 1, firstNonWhitespaceColumn(rawHeader)),
        },
        nextIndex,
    ];
}
function parseStep(lines, startIndex) {
    const header = lines[startIndex]?.trim() ?? "";
    const rawHeader = lines[startIndex] ?? "";
    const parsedHeader = parseStepHeader(header);
    if (!parsedHeader.valid) {
        throw new ParseError("Invalid step declaration", startIndex + 1, firstNonWhitespaceColumn(rawHeader), rawHeader.length + 1);
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
function parseStatement(lines, lineIndex, line) {
    if (line.startsWith("premise ")) {
        return parseTextStatement("premise", lines, lineIndex);
    }
    if (line.startsWith("evidence ")) {
        return parseTextStatement("evidence", lines, lineIndex);
    }
    if (line.startsWith("pending ")) {
        return parseTextStatement("pending", lines, lineIndex);
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
    throw new ParseError("Unknown statement type", lineIndex + 1, firstNonWhitespaceColumn(lines[lineIndex] ?? ""), (lines[lineIndex] ?? "").length + 1);
}
function parseTextStatement(role, lines, startIndex) {
    const header = lines[startIndex]?.trim() ?? "";
    const rawHeader = lines[startIndex] ?? "";
    const id = parseIdentifierAfterKeyword(header, role);
    if (!id) {
        throw new ParseError(`Invalid ${role} declaration`, startIndex + 1, firstNonWhitespaceColumn(rawHeader), rawHeader.length + 1);
    }
    const textIndex = nextSignificantLineIndex(lines, startIndex + 1);
    const rawTextLine = lines[textIndex] ?? "";
    const textLine = rawTextLine.trim() ?? "";
    if (!textLine.startsWith('"')) {
        throw new ParseError(`${role} text is required`, textIndex + 1, firstNonWhitespaceColumn(rawTextLine), rawTextLine.length + 1);
    }
    const { annotations, nextIndex } = parseAnnotations(lines, textIndex + 1, currentIndent(rawTextLine));
    return {
        role,
        id,
        text: stripQuotes(textLine),
        annotations,
        span: span(startIndex + 1, firstNonWhitespaceColumn(rawHeader)),
        nextIndex,
    };
}
function parseViewpoint(lines, startIndex) {
    const header = lines[startIndex]?.trim() ?? "";
    const rawHeader = lines[startIndex] ?? "";
    const match = /^viewpoint\s+([A-Za-z][A-Za-z0-9_-]*):$/.exec(header);
    if (!match) {
        throw new ParseError("Invalid viewpoint declaration", startIndex + 1, firstNonWhitespaceColumn(rawHeader), rawHeader.length + 1);
    }
    const axisIndex = nextSignificantLineIndex(lines, startIndex + 1);
    const rawAxisLine = lines[axisIndex] ?? "";
    const axisLine = rawAxisLine.trim() ?? "";
    const axisMatch = /^axis\s+([A-Za-z][A-Za-z0-9_-]*)$/.exec(axisLine);
    if (!axisMatch) {
        throw new ParseError("Viewpoint axis is required", axisIndex + 1, firstNonWhitespaceColumn(rawAxisLine), rawAxisLine.length + 1);
    }
    return {
        role: "viewpoint",
        id: match[1],
        axis: axisMatch[1],
        span: span(startIndex + 1, firstNonWhitespaceColumn(rawHeader)),
        nextIndex: axisIndex + 1,
    };
}
function parsePartition(lines, startIndex) {
    const header = lines[startIndex]?.trim() ?? "";
    const rawHeader = lines[startIndex] ?? "";
    const match = /^partition\s+([A-Za-z][A-Za-z0-9_-]*)\s+on\s+([A-Za-z][A-Za-z0-9_-]*)\s+axis\s+([A-Za-z][A-Za-z0-9_-]*):$/.exec(header);
    if (!match) {
        throw new ParseError("Invalid partition declaration", startIndex + 1, firstNonWhitespaceColumn(rawHeader), rawHeader.length + 1);
    }
    const members = [];
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
            throw new ParseError("Invalid partition member", index + 1, firstNonWhitespaceColumn(raw), raw.length + 1);
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
function parseDecision(lines, startIndex) {
    const header = lines[startIndex]?.trim() ?? "";
    const rawHeader = lines[startIndex] ?? "";
    const parsedHeader = parseDecisionHeader(header);
    if (!parsedHeader) {
        throw new ParseError("Invalid decision declaration", startIndex + 1, firstNonWhitespaceColumn(rawHeader), rawHeader.length + 1);
    }
    const textIndex = nextSignificantLineIndex(lines, startIndex + 1);
    const rawTextLine = lines[textIndex] ?? "";
    const textLine = rawTextLine.trim() ?? "";
    if (!textLine.startsWith('"')) {
        throw new ParseError("Decision text is required", textIndex + 1, firstNonWhitespaceColumn(rawTextLine), rawTextLine.length + 1);
    }
    const { annotations, nextIndex } = parseAnnotations(lines, textIndex + 1, currentIndent(rawTextLine));
    return {
        role: "decision",
        id: parsedHeader.id,
        basedOn: parsedHeader.basedOn,
        text: stripQuotes(textLine),
        annotations,
        span: span(startIndex + 1, firstNonWhitespaceColumn(rawHeader)),
        nextIndex,
    };
}
function parseComparison(lines, startIndex) {
    const header = lines[startIndex]?.trim() ?? "";
    const rawHeader = lines[startIndex] ?? "";
    const parsedHeader = parseComparisonHeader(header);
    if (!parsedHeader) {
        throw new ParseError("Invalid comparison declaration", startIndex + 1, firstNonWhitespaceColumn(rawHeader), rawHeader.length + 1);
    }
    const textIndex = nextSignificantLineIndex(lines, startIndex + 1);
    const rawTextLine = lines[textIndex] ?? "";
    const textLine = rawTextLine.trim() ?? "";
    if (!textLine.startsWith('"')) {
        throw new ParseError("Comparison text is required", textIndex + 1, firstNonWhitespaceColumn(rawTextLine), rawTextLine.length + 1);
    }
    const { annotations, nextIndex } = parseAnnotations(lines, textIndex + 1, currentIndent(rawTextLine));
    return {
        role: "comparison",
        id: parsedHeader.id,
        problemId: parsedHeader.problemId,
        viewpointId: parsedHeader.viewpointId,
        relation: parsedHeader.relation,
        leftDecisionId: parsedHeader.leftDecisionId,
        rightDecisionId: parsedHeader.rightDecisionId,
        text: stripQuotes(textLine),
        annotations,
        span: span(startIndex + 1, firstNonWhitespaceColumn(rawHeader)),
        nextIndex,
    };
}
function parseQuery(lines, startIndex) {
    const header = lines[startIndex]?.trim() ?? "";
    const rawHeader = lines[startIndex] ?? "";
    const match = /^query\s+([A-Za-z][A-Za-z0-9_-]*):$/.exec(header);
    if (!match) {
        throw new ParseError("Invalid query declaration", startIndex + 1, firstNonWhitespaceColumn(rawHeader), rawHeader.length + 1);
    }
    const expressionIndex = nextSignificantLineIndex(lines, startIndex + 1);
    const rawExpressionLine = lines[expressionIndex] ?? "";
    const expressionLine = rawExpressionLine.trim() ?? "";
    if (!expressionLine) {
        throw new ParseError("Query expression is required", expressionIndex + 1, firstNonWhitespaceColumn(rawExpressionLine), rawExpressionLine.length + 1);
    }
    return [
        {
            id: match[1],
            expression: expressionLine,
            span: span(startIndex + 1, firstNonWhitespaceColumn(rawHeader)),
            expressionSpan: span(expressionIndex + 1, firstNonWhitespaceColumn(rawExpressionLine)),
        },
        expressionIndex + 1,
    ];
}
//# sourceMappingURL=parser.js.map