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
  "    description \"...\"",
  "  problem P1:",
  "    \"...\"",
  "  step S1:",
  "    premise PR1:",
  "      \"...\"",
  "  step S2:",
  "    evidence EV1:",
  "      \"...\"",
  "  step S3:",
  "    decision D1 based_on PR1, EV1:",
  "      \"...\"",
  "  step S4:",
  "    pending PD1:",
  "      \"...\"",
  "  step S5:",
  "    viewpoint VP1:",
  "      axis cost",
  "  step S6:",
  "    partition PT1 on DomainName axis cost:",
  "      Cheap := cost < 100",
  "      Others := not Cheap",
  "  query Q1:",
  "    related_decisions(P1)",
  "",
  "Rules:",
  "  - top-level keywords are framework, domain, problem, step, query",
  "  - domain/problem/query/step headers end with ':'",
  "  - step body starts on the next indented line",
  "  - premise/evidence/pending/decision text is a quoted string on the next indented line",
  "  - decision based_on is optional, but when present it is comma-separated",
  "  - query expression is currently free-form text; related_decisions(P1) is the canonical pattern",
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

function parseErrorHelp(error: ParseError): ParseErrorHelp {
  if (error.message.startsWith("Unexpected top-level statement:")) {
    return {
      rationale: "top-level では framework / domain / problem / step / query だけが許可される。",
      expectedSyntax: [
        "framework ReviewAudit",
        "domain DesignReview:",
        "  description \"...\"",
        "problem P1:",
        "  \"...\"",
        "step S1:",
        "  evidence EV1:",
        "    \"...\"",
        "query Q1:",
        "  related_decisions(P1)",
      ].join("\n"),
    };
  }

  if (error.message.startsWith("Invalid framework declaration")) {
    return {
      rationale: "framework は 'framework Name' または 'framework Name:' で始める必要がある。",
      expectedSyntax: [
        "framework ReviewAudit",
        "framework ReviewAudit:",
        "  requires problem",
      ].join("\n"),
    };
  }

  if (error.message.startsWith("Invalid domain declaration") || error.message.startsWith("Domain description is required")) {
    return {
      rationale: "domain は header 行の次に description 行を持つ。",
      expectedSyntax: [
        "domain DesignReview:",
        "  description \"設計レビュー論点\"",
      ].join("\n"),
    };
  }

  if (error.message.startsWith("Invalid problem declaration") || error.message.startsWith("Problem text is required")) {
    return {
      rationale: "problem は header 行の次に quoted text を持つ。",
      expectedSyntax: [
        "problem P1:",
        "  \"監査したい問題文\"",
      ].join("\n"),
    };
  }

  if (error.message.startsWith("Invalid step declaration")) {
    return {
      rationale: "step は 'step StepId:' で始め、その次の indented line に statement を置く。",
      expectedSyntax: [
        "step S1:",
        "  evidence EV1:",
        "    \"根拠\"",
      ].join("\n"),
    };
  }

  if (error.message.startsWith("Unknown statement type")) {
    return {
      rationale: "step の直下では premise / evidence / pending / viewpoint / partition / decision だけが許可される。",
      expectedSyntax: [
        "step S1:",
        "  premise PR1:",
        "    \"前提\"",
      ].join("\n"),
    };
  }

  if (error.message.startsWith("Invalid premise declaration") || error.message.startsWith("premise text is required")) {
    return {
      rationale: "premise は 'premise Id:' の次に quoted text を持つ。",
      expectedSyntax: [
        "step S1:",
        "  premise PR1:",
        "    \"現在の前提\"",
      ].join("\n"),
    };
  }

  if (error.message.startsWith("Invalid evidence declaration") || error.message.startsWith("evidence text is required")) {
    return {
      rationale: "evidence は 'evidence Id:' の次に quoted text を持つ。",
      expectedSyntax: [
        "step S1:",
        "  evidence EV1:",
        "    \"観測事実\"",
      ].join("\n"),
    };
  }

  if (error.message.startsWith("Invalid pending declaration") || error.message.startsWith("pending text is required")) {
    return {
      rationale: "pending は 'pending Id:' の次に quoted text を持つ。",
      expectedSyntax: [
        "step S1:",
        "  pending PD1:",
        "    \"未確定事項\"",
      ].join("\n"),
    };
  }

  if (error.message.startsWith("Invalid viewpoint declaration") || error.message.startsWith("Viewpoint axis is required")) {
    return {
      rationale: "viewpoint は 'viewpoint Id:' の次に 'axis name' を持つ。",
      expectedSyntax: [
        "step S1:",
        "  viewpoint VP1:",
        "    axis cost",
      ].join("\n"),
    };
  }

  if (error.message.startsWith("Invalid partition declaration") || error.message.startsWith("Invalid partition member")) {
    return {
      rationale: "partition は on/axis を含む header と、4 space 相当で始まる member 行を持つ。",
      expectedSyntax: [
        "step S1:",
        "  partition PT1 on ReviewDomain axis cost:",
        "    Cheap := cost < 100",
        "    Others := not Cheap",
      ].join("\n"),
    };
  }

  if (error.message.startsWith("Invalid decision declaration") || error.message.startsWith("Decision text is required")) {
    return {
      rationale: "decision は 'decision Id based_on Ref1, Ref2:' の形式で、次行に quoted text を持つ。",
      expectedSyntax: [
        "step S1:",
        "  decision D1 based_on PR1, EV1:",
        "    \"ADR を先に確定する\"",
      ].join("\n"),
    };
  }

  if (error.message.startsWith("Invalid query declaration") || error.message.startsWith("Query expression is required")) {
    return {
      rationale: "query は 'query Id:' の次に expression を持つ。",
      expectedSyntax: [
        "query Q1:",
        "  related_decisions(P1)",
      ].join("\n"),
    };
  }

  return {
    rationale: "DSL の header、indent、quoted text の位置が期待形とずれている可能性がある。",
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
    rationale: "DSL を新規生成する前に top-level block、indent、quoted text の位置を確認するための案内。",
    suggestion: "CLI では 'llmthink dsl help'、MCP では dsl action=help、VSIX tool では action=help を使う。",
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

export function createParseErrorReport(error: ParseError, documentId: string): AuditReport {
  const help = parseErrorHelp(error);
  const issue: AuditIssue = {
    issue_id: "ISSUE-001",
    category: "contract_violation",
    severity: "fatal",
    target_refs: [{ ref_id: documentId }],
    message: error.message,
    rationale: help.rationale,
    suggestion: "CLI では 'llmthink dsl help'、MCP では dsl action=help、VSIX tool では action=help を使って全体文法を確認する。",
    metadata: {
      line: error.line,
      expected_syntax: help.expectedSyntax,
      syntax_help: "llmthink dsl help / MCP dsl action=help / VSIX tool action=help",
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