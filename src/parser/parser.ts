import {
  type DecisionStatement,
  type DocumentAst,
  type DomainDecl,
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
  type ViewpointStatement,
} from "../model/ast.js";

function span(line: number, column = 1): SourceSpan {
  return { line, column };
}

function stripQuotes(value: string): string {
  return value.replace(/^"/, "").replace(/"$/, "");
}

function currentIndent(line: string): number {
  return line.match(/^\s*/)?.[0].length ?? 0;
}

export class ParseError extends Error {
  constructor(message: string, readonly line: number) {
    super(`${message} at line ${line}`);
  }
}

export function parseDocument(input: string): DocumentAst {
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  const document: DocumentAst = {
    domains: [],
    problems: [],
    steps: [],
    queries: [],
  };

  let index = 0;
  while (index < lines.length) {
    const rawLine = lines[index] ?? "";
    const line = rawLine.trim();
    if (!line) {
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

    if (line.startsWith("step ")) {
      const [step, nextIndex] = parseStep(lines, index);
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

    throw new ParseError(`Unexpected top-level statement: ${line}`, index + 1);
  }

  return document;
}

function parseFramework(lines: string[], startIndex: number): [FrameworkDecl, number] {
  const header = lines[startIndex]?.trim() ?? "";
  const match = /^framework\s+([A-Za-z][A-Za-z0-9_-]*)(:)?$/.exec(header);
  if (!match) {
    throw new ParseError("Invalid framework declaration", startIndex + 1);
  }

  const rules: FrameworkRule[] = [];
  let index = startIndex + 1;
  if (match[2] === ":") {
    while (index < lines.length) {
      const raw = lines[index] ?? "";
      if (!raw.trim()) {
        index += 1;
        continue;
      }
      if (currentIndent(raw) < 2) {
        break;
      }
      const trimmed = raw.trim();
      const ruleMatch = /^(requires|forbids|warns)\s+(.+)$/.exec(trimmed);
      if (!ruleMatch) {
        throw new ParseError("Invalid framework rule", index + 1);
      }
      rules.push({ kind: ruleMatch[1] as FrameworkRule["kind"], value: ruleMatch[2], span: span(index + 1) } as FrameworkRule & { span: SourceSpan });
      index += 1;
    }
  }

  return [
    {
      name: match[1],
      rules: rules.map(({ kind, value }) => ({ kind, value })),
      span: span(startIndex + 1),
    },
    index,
  ];
}

function parseDomain(lines: string[], startIndex: number): [DomainDecl, number] {
  const header = lines[startIndex]?.trim() ?? "";
  const match = /^domain\s+([A-Za-z][A-Za-z0-9_-]*):$/.exec(header);
  if (!match) {
    throw new ParseError("Invalid domain declaration", startIndex + 1);
  }
  const descriptionLine = lines[startIndex + 1]?.trim() ?? "";
  const descriptionMatch = /^description\s+"(.+)"$/.exec(descriptionLine);
  if (!descriptionMatch) {
    throw new ParseError("Domain description is required", startIndex + 2);
  }
  return [
    { name: match[1], description: descriptionMatch[1], span: span(startIndex + 1) },
    startIndex + 2,
  ];
}

function parseProblem(lines: string[], startIndex: number): [ProblemDecl, number] {
  const header = lines[startIndex]?.trim() ?? "";
  const match = /^problem\s+([A-Za-z][A-Za-z0-9_-]*):$/.exec(header);
  if (!match) {
    throw new ParseError("Invalid problem declaration", startIndex + 1);
  }
  const textLine = lines[startIndex + 1]?.trim() ?? "";
  if (!textLine.startsWith('"')) {
    throw new ParseError("Problem text is required", startIndex + 2);
  }
  return [
    { name: match[1], text: stripQuotes(textLine), span: span(startIndex + 1) },
    startIndex + 2,
  ];
}

function parseStep(lines: string[], startIndex: number): [StepDecl, number] {
  const header = lines[startIndex]?.trim() ?? "";
  const match = /^step\s+([A-Za-z][A-Za-z0-9_-]*):$/.exec(header);
  if (!match) {
    throw new ParseError("Invalid step declaration", startIndex + 1);
  }

  const statementLine = lines[startIndex + 1]?.trim() ?? "";
  const statement = parseStatement(lines, startIndex + 1, statementLine);
  return [
    { id: match[1], statement, span: span(startIndex + 1) },
    statement.nextIndex,
  ];
}

function parseStatement(lines: string[], lineIndex: number, line: string): StepStatement & { nextIndex: number } {
  if (line.startsWith("premise ")) {
    return parseTextStatement("premise", lines, lineIndex) as PremiseStatement & { nextIndex: number };
  }
  if (line.startsWith("evidence ")) {
    return parseTextStatement("evidence", lines, lineIndex) as EvidenceStatement & { nextIndex: number };
  }
  if (line.startsWith("pending ")) {
    return parseTextStatement("pending", lines, lineIndex) as PendingStatement & { nextIndex: number };
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
  throw new ParseError("Unknown statement type", lineIndex + 1);
}

function parseTextStatement<T extends "premise" | "evidence" | "pending">(
  role: T,
  lines: string[],
  startIndex: number,
): ({ role: T; id: string; text: string; span: SourceSpan } & { nextIndex: number }) {
  const header = lines[startIndex]?.trim() ?? "";
  const match = new RegExp(`^${role}\\s+([A-Za-z][A-Za-z0-9_-]*):$`).exec(header);
  if (!match) {
    throw new ParseError(`Invalid ${role} declaration`, startIndex + 1);
  }
  const textLine = lines[startIndex + 1]?.trim() ?? "";
  if (!textLine.startsWith('"')) {
    throw new ParseError(`${role} text is required`, startIndex + 2);
  }
  return {
    role,
    id: match[1],
    text: stripQuotes(textLine),
    span: span(startIndex + 1),
    nextIndex: startIndex + 2,
  };
}

function parseViewpoint(lines: string[], startIndex: number): ViewpointStatement & { nextIndex: number } {
  const header = lines[startIndex]?.trim() ?? "";
  const match = /^viewpoint\s+([A-Za-z][A-Za-z0-9_-]*):$/.exec(header);
  if (!match) {
    throw new ParseError("Invalid viewpoint declaration", startIndex + 1);
  }
  const axisLine = lines[startIndex + 1]?.trim() ?? "";
  const axisMatch = /^axis\s+([A-Za-z][A-Za-z0-9_-]*)$/.exec(axisLine);
  if (!axisMatch) {
    throw new ParseError("Viewpoint axis is required", startIndex + 2);
  }
  return { role: "viewpoint", id: match[1], axis: axisMatch[1], span: span(startIndex + 1), nextIndex: startIndex + 2 };
}

function parsePartition(lines: string[], startIndex: number): PartitionStatement & { nextIndex: number } {
  const header = lines[startIndex]?.trim() ?? "";
  const match = /^partition\s+([A-Za-z][A-Za-z0-9_-]*)\s+on\s+([A-Za-z][A-Za-z0-9_-]*)\s+axis\s+([A-Za-z][A-Za-z0-9_-]*):$/.exec(header);
  if (!match) {
    throw new ParseError("Invalid partition declaration", startIndex + 1);
  }
  const members: PartitionMember[] = [];
  let index = startIndex + 1;
  while (index < lines.length) {
    const raw = lines[index] ?? "";
    if (!raw.trim()) {
      index += 1;
      continue;
    }
    if (currentIndent(raw) < 4) {
      break;
    }
    const memberMatch = /^([A-Za-z][A-Za-z0-9_-]*)\s*:=\s*(.+)$/.exec(raw.trim());
    if (!memberMatch) {
      throw new ParseError("Invalid partition member", index + 1);
    }
    members.push({ name: memberMatch[1], predicate: memberMatch[2] });
    index += 1;
  }
  return {
    role: "partition",
    id: match[1],
    domainName: match[2],
    axis: match[3],
    members,
    span: span(startIndex + 1),
    nextIndex: index,
  };
}

function parseDecision(lines: string[], startIndex: number): DecisionStatement & { nextIndex: number } {
  const header = lines[startIndex]?.trim() ?? "";
  const match = /^decision\s+([A-Za-z][A-Za-z0-9_-]*)(?:\s+based_on\s+(.+?))?:$/.exec(header);
  if (!match) {
    throw new ParseError("Invalid decision declaration", startIndex + 1);
  }
  const textLine = lines[startIndex + 1]?.trim() ?? "";
  if (!textLine.startsWith('"')) {
    throw new ParseError("Decision text is required", startIndex + 2);
  }
  const basedOn = match[2] ? match[2].split(",").map((value) => value.trim()).filter(Boolean) : [];
  return {
    role: "decision",
    id: match[1],
    basedOn,
    text: stripQuotes(textLine),
    span: span(startIndex + 1),
    nextIndex: startIndex + 2,
  };
}

function parseQuery(lines: string[], startIndex: number): [QueryDecl, number] {
  const header = lines[startIndex]?.trim() ?? "";
  const match = /^query\s+([A-Za-z][A-Za-z0-9_-]*):$/.exec(header);
  if (!match) {
    throw new ParseError("Invalid query declaration", startIndex + 1);
  }
  const expressionLine = lines[startIndex + 1]?.trim() ?? "";
  if (!expressionLine) {
    throw new ParseError("Query expression is required", startIndex + 2);
  }
  return [
    { id: match[1], expression: expressionLine, span: span(startIndex + 1) },
    startIndex + 2,
  ];
}