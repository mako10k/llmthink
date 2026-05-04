import type { AuditIssue, AuditReport } from "../model/diagnostics.js";
import type { ParseError } from "../parser/parser.js";

const ENGINE_VERSION = "0.1.0";

const DSL_SYNTAX_GUIDANCE = [
  "LLMThink DSL Syntax Guidance",
  "",
  "Top-level blocks:",
  "  framework Name",
  "  framework Name:",
  "    requires problem",
  "    warns decision",
  "  domain DomainName:",
  '    description "..."',
  "  problem P1:",
  '    "..."',
  "  step S1:",
  "    premise PR1:",
  '      "..."',
  "  step S2:",
  "    evidence EV1:",
  '      "..."',
  "  step S3:",
  "    decision D1 based_on PR1, EV1:",
  '      "..."',
  "  step S4:",
  "    pending PD1:",
  '      "..."',
  "  step S5:",
  "    viewpoint VP1:",
  "      axis cost",
  "  step S6:",
  "    partition PT1 on DomainName axis cost:",
  "      Cheap := cost < 100",
  "      Others := not Cheap",
  "  query Q1:",
  '    .problems[] | select(.id == "P1") | related_decisions',
  "",
  "Rules:",
  "  - top-level keywords are framework, domain, problem, step, query",
  "  - domain/problem/query/step headers end with ':'",
  "  - step body starts on the next indented line",
  "  - premise/evidence/pending/decision text is a quoted string on the next indented line",
  "  - decision based_on is optional, but when present it is comma-separated",
  '  - query expression uses DSLQL; .problems[] | select(.id == "P1") | related_decisions is the canonical pattern',
  "",
  "Help:",
  "  - CLI: llmthink dsl help",
  "  - MCP tool: call dsl with action=help",
  "  - VSIX tool: set action=help or dslText to 'dsl help'",
].join("\n");

interface ParseErrorHelp {
  rationale: string;
  expectedSyntax: string;
}

interface ParseErrorHelpRule {
  matches: (message: string) => boolean;
  help: ParseErrorHelp;
}

function startsWithAny(message: string, patterns: string[]): boolean {
  return patterns.some((pattern) => message.startsWith(pattern));
}

const PARSE_ERROR_HELP_RULES: ParseErrorHelpRule[] = [
  {
    matches: (message) =>
      startsWithAny(message, ["Unexpected top-level statement:"]),
    help: {
      rationale:
        "top-level では framework / domain / problem / step / query だけが許可される。",
      expectedSyntax: [
        "framework ReviewAudit",
        "domain DesignReview:",
        '  description "..."',
        "problem P1:",
        '  "..."',
        "step S1:",
        "  evidence EV1:",
        '    "..."',
        "query Q1:",
        '  .problems[] | select(.id == "P1") | related_decisions',
      ].join("\n"),
    },
  },
  {
    matches: (message) =>
      startsWithAny(message, ["Invalid framework declaration"]),
    help: {
      rationale:
        "framework は 'framework Name' または 'framework Name:' で始める必要がある。",
      expectedSyntax: [
        "framework ReviewAudit",
        "framework ReviewAudit:",
        "  requires problem",
      ].join("\n"),
    },
  },
  {
    matches: (message) =>
      startsWithAny(message, [
        "Invalid domain declaration",
        "Domain description is required",
      ]),
    help: {
      rationale: "domain は header 行の次に description 行を持つ。",
      expectedSyntax: [
        "domain DesignReview:",
        '  description "設計レビュー論点"',
      ].join("\n"),
    },
  },
  {
    matches: (message) =>
      startsWithAny(message, [
        "Invalid problem declaration",
        "Problem text is required",
      ]),
    help: {
      rationale: "problem は header 行の次に quoted text を持つ。",
      expectedSyntax: ["problem P1:", '  "監査したい問題文"'].join("\n"),
    },
  },
  {
    matches: (message) => startsWithAny(message, ["Invalid step declaration"]),
    help: {
      rationale:
        "step は 'step StepId:' で始め、その次の indented line に statement を置く。",
      expectedSyntax: ["step S1:", "  evidence EV1:", '    "根拠"'].join("\n"),
    },
  },
  {
    matches: (message) => startsWithAny(message, ["Unknown statement type"]),
    help: {
      rationale:
        "step の直下では premise / evidence / pending / viewpoint / partition / decision だけが許可される。",
      expectedSyntax: ["step S1:", "  premise PR1:", '    "前提"'].join("\n"),
    },
  },
  {
    matches: (message) =>
      startsWithAny(message, [
        "Invalid premise declaration",
        "premise text is required",
      ]),
    help: {
      rationale: "premise は 'premise Id:' の次に quoted text を持つ。",
      expectedSyntax: ["step S1:", "  premise PR1:", '    "現在の前提"'].join(
        "\n",
      ),
    },
  },
  {
    matches: (message) =>
      startsWithAny(message, [
        "Invalid evidence declaration",
        "evidence text is required",
      ]),
    help: {
      rationale: "evidence は 'evidence Id:' の次に quoted text を持つ。",
      expectedSyntax: ["step S1:", "  evidence EV1:", '    "観測事実"'].join(
        "\n",
      ),
    },
  },
  {
    matches: (message) =>
      startsWithAny(message, [
        "Invalid pending declaration",
        "pending text is required",
      ]),
    help: {
      rationale: "pending は 'pending Id:' の次に quoted text を持つ。",
      expectedSyntax: ["step S1:", "  pending PD1:", '    "未確定事項"'].join(
        "\n",
      ),
    },
  },
  {
    matches: (message) =>
      startsWithAny(message, [
        "Invalid viewpoint declaration",
        "Viewpoint axis is required",
      ]),
    help: {
      rationale: "viewpoint は 'viewpoint Id:' の次に 'axis name' を持つ。",
      expectedSyntax: ["step S1:", "  viewpoint VP1:", "    axis cost"].join(
        "\n",
      ),
    },
  },
  {
    matches: (message) =>
      startsWithAny(message, [
        "Invalid partition declaration",
        "Invalid partition member",
      ]),
    help: {
      rationale:
        "partition は on/axis を含む header と、4 space 相当で始まる member 行を持つ。",
      expectedSyntax: [
        "step S1:",
        "  partition PT1 on ReviewDomain axis cost:",
        "    Cheap := cost < 100",
        "    Others := not Cheap",
      ].join("\n"),
    },
  },
  {
    matches: (message) =>
      startsWithAny(message, [
        "Invalid decision declaration",
        "Decision text is required",
      ]),
    help: {
      rationale:
        "decision は 'decision Id based_on Ref1, Ref2:' の形式で、次行に quoted text を持つ。",
      expectedSyntax: [
        "step S1:",
        "  decision D1 based_on PR1, EV1:",
        '    "ADR を先に確定する"',
      ].join("\n"),
    },
  },
  {
    matches: (message) =>
      startsWithAny(message, [
        "Invalid query declaration",
        "Query expression is required",
      ]),
    help: {
      rationale: "query は 'query Id:' の次に expression を持つ。",
      expectedSyntax: [
        "query Q1:",
        '  .problems[] | select(.id == "P1") | related_decisions',
      ].join("\n"),
    },
  },
];

function parseErrorHelp(error: ParseError): ParseErrorHelp {
  for (const rule of PARSE_ERROR_HELP_RULES) {
    if (rule.matches(error.message)) {
      return rule.help;
    }
  }

  return {
    rationale:
      "DSL の header、indent、quoted text の位置が期待形とずれている可能性がある。",
    expectedSyntax: DSL_SYNTAX_GUIDANCE,
  };
}

export function isDslHelpRequest(input: string): boolean {
  const normalized = input.trim().toLowerCase();
  return normalized === "dsl help";
}

export function getDslSyntaxGuidanceText(): string {
  return `${DSL_SYNTAX_GUIDANCE}\n`;
}

export function createDslGuidanceReport(documentId = "dsl-help"): AuditReport {
  const issue: AuditIssue = {
    issue_id: "ISSUE-001",
    category: "semantic_hint",
    severity: "info",
    target_refs: [{ ref_id: documentId }],
    message: "LLMThink DSL の文法ガイダンス。",
    rationale:
      "DSL を新規生成する前に top-level block、indent、quoted text の位置を確認するための案内。",
    suggestion:
      "CLI では 'llmthink dsl help'、MCP では dsl action=help、VSIX tool では action=help を使う。",
    metadata: {
      syntax_guidance: DSL_SYNTAX_GUIDANCE,
    },
  };

  return {
    engine_version: ENGINE_VERSION,
    document_id: documentId,
    generated_at: new Date().toISOString(),
    summary: {
      fatal_count: 0,
      error_count: 0,
      warning_count: 0,
      info_count: 1,
      hint_count: 0,
    },
    results: [issue],
    query_results: [],
  };
}

export function createParseErrorReport(
  error: ParseError,
  documentId: string,
): AuditReport {
  const help = parseErrorHelp(error);
  const issue: AuditIssue = {
    issue_id: "ISSUE-001",
    category: "contract_violation",
    severity: "fatal",
    target_refs: [{ ref_id: documentId }],
    message: error.message,
    rationale: help.rationale,
    suggestion:
      "CLI では 'llmthink dsl help'、MCP では dsl action=help、VSIX tool では action=help を使って全体文法を確認する。",
    metadata: {
      line: error.line,
      column: error.column,
      end_column: error.endColumn,
      expected_syntax: help.expectedSyntax,
      syntax_help:
        "llmthink dsl help / MCP dsl action=help / VSIX tool action=help",
      syntax_overview: DSL_SYNTAX_GUIDANCE,
    },
  };

  return {
    engine_version: ENGINE_VERSION,
    document_id: documentId,
    generated_at: new Date().toISOString(),
    summary: {
      fatal_count: 1,
      error_count: 0,
      warning_count: 0,
      info_count: 0,
      hint_count: 0,
    },
    results: [issue],
    query_results: [],
  };
}
