#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { resolveThoughtStorageRoot } from "../config/runtime.js";
import {
  getDslSyntaxGuidanceText,
  isDslHelpRequest,
  parseDslHelpRequest,
} from "../dsl/guidance.js";
import {
  AUDIT_RESULT_CATEGORIES,
  AUDIT_SEVERITIES,
  type AuditResultCategory,
  type AuditSeverity,
} from "../model/diagnostics.js";
import {
  formatAuditReportText,
  limitAuditReport,
  type AuditReportFormatOptions,
} from "../presentation/report.js";
import {
  formatPersistedThoughtAudit,
  formatThoughtHistory,
  formatThoughtList,
  formatThoughtReflections,
  formatThoughtSearchResults,
  formatThoughtSemanticAuditPairs,
  formatThoughtSemanticAuditSummary,
  formatThoughtSummary,
} from "../presentation/thought.js";
import {
  addThoughtReflection,
  deleteThought,
  relateThought,
  finalizeThought,
  listThoughts,
  loadThought,
  draftThought,
  saveThoughtSemanticAudit,
  searchThoughtRecords,
  type ThoughtReflectionKind,
  type ThoughtSemanticAuditVerdict,
} from "../thought/store.js";
import { auditAndPersistThought } from "../thought/workflow.js";

const server = new McpServer({
  name: "llmthink",
  version: "0.5.2",
});

interface McpAuditOutputOptions {
  maxIssues?: number;
  minSeverity?: AuditSeverity;
  suppressCategories?: AuditResultCategory[];
}

function auditOutputOptions(
  options: McpAuditOutputOptions,
): AuditReportFormatOptions {
  return {
    maxIssues: options.maxIssues,
    minSeverity: options.minSeverity,
    suppressedCategories: options.suppressCategories,
  };
}

function isDslHelpAction(
  action: "audit" | "help",
  dslText: string | undefined,
): boolean {
  return action === "help" || Boolean(dslText && isDslHelpRequest(dslText));
}

function thoughtLocation(filePath?: string) {
  return {
    storageRoot: resolveThoughtStorageRoot({
      cwd: process.cwd(),
      filePath,
    }),
  };
}

function textContent(text: string) {
  return { type: "text" as const, text };
}

function loadThoughtSourceText(
  thoughtId: string,
  dslText?: string,
  fromThoughtId?: string,
): string | undefined {
  if (dslText) {
    return dslText;
  }
  if (!fromThoughtId) {
    return undefined;
  }
  const source = loadThought(fromThoughtId, thoughtLocation());
  return source.finalText ?? source.draftText;
}

function getStoredThoughtText(thoughtId: string): string | undefined {
  const thought = loadThought(thoughtId, thoughtLocation());
  return thought.draftText ?? thought.finalText;
}

function showThoughtView(
  thoughtId: string,
  view?:
    | "summary"
    | "draft"
    | "final"
    | "audit"
    | "reflections"
    | "semantic-audit"
    | "semantic-audit-pairs",
  outputOptions: AuditReportFormatOptions = {},
) {
  const snapshot = loadThought(thoughtId, thoughtLocation());
  if (view === "draft") {
    return { content: [textContent(snapshot.draftText ?? "")] };
  }
  if (view === "final") {
    return { content: [textContent(snapshot.finalText ?? "")] };
  }
  if (view === "audit") {
    return {
      content: [
        textContent(
          snapshot.latestAudit
            ? formatAuditReportText(snapshot.latestAudit, outputOptions)
            : "No audit yet.\n",
        ),
      ],
    };
  }
  if (view === "reflections") {
    return {
      content: [textContent(formatThoughtReflections(snapshot.reflections))],
    };
  }
  if (view === "semantic-audit") {
    return {
      content: [textContent(formatThoughtSemanticAuditSummary(snapshot))],
    };
  }
  if (view === "semantic-audit-pairs") {
    return {
      content: [textContent(formatThoughtSemanticAuditPairs(snapshot))],
    };
  }
  return { content: [textContent(formatThoughtSummary(snapshot))] };
}

function summarizeThought(thoughtId: string) {
  return {
    content: [textContent(formatThoughtSummary(loadThought(thoughtId, thoughtLocation())))],
  };
}

async function handleThoughtSearch(
  query: string | undefined,
  limit: number | undefined,
  includeReflections: boolean,
) {
  if (!query) {
    throw new Error("query is required when action=search");
  }
  const results = (
    await searchThoughtRecords(query, thoughtLocation(), { includeReflections })
  ).slice(0, limit ?? 5);
  return { content: [textContent(formatThoughtSearchResults(results))] };
}

function requireThoughtId(thoughtId: string | undefined): string {
  if (!thoughtId) {
    throw new Error("thoughtId is required for this action");
  }
  return thoughtId;
}

function requireThoughtText(
  thoughtId: string,
  sourceText: string | undefined,
): string {
  const currentText = sourceText ?? getStoredThoughtText(thoughtId);
  if (!currentText) {
    throw new Error("No draft or final text exists for this thought");
  }
  return currentText;
}

function handleThoughtDraftAction(
  thoughtId: string,
  sourceText: string | undefined,
) {
  if (!sourceText) {
    throw new Error("dslText or fromThoughtId is required when action=draft");
  }
  draftThought(thoughtId, sourceText, thoughtLocation());
  return summarizeThought(thoughtId);
}

function handleThoughtRelateAction(
  thoughtId: string,
  fromThoughtId: string | undefined,
) {
  if (!fromThoughtId) {
    throw new Error("fromThoughtId is required when action=relate");
  }
  relateThought(thoughtId, fromThoughtId, thoughtLocation());
  return summarizeThought(thoughtId);
}

async function handleThoughtAuditAction(
  thoughtId: string,
  sourceText: string | undefined,
  outputOptions: AuditReportFormatOptions,
) {
  const persisted = await auditAndPersistThought({
    dslText: requireThoughtText(thoughtId, sourceText),
    thoughtId,
  }, {
    fileBaseDir: process.cwd(),
    storageRoot: resolveThoughtStorageRoot({ cwd: process.cwd() }),
  });
  return {
    content: [
      textContent(
        `${formatPersistedThoughtAudit(persisted)}${formatAuditReportText(persisted.report, outputOptions)}`,
      ),
      textContent(
        (() => {
          const outputReport = limitAuditReport(persisted.report, outputOptions);
          return JSON.stringify(
            {
              thought_id: persisted.thoughtId,
              id_source: persisted.idSource,
              report: outputReport,
            },
            null,
            2,
          );
        })(),
      ),
    ],
  };
}

function handleThoughtFinalizeAction(
  thoughtId: string,
  sourceText: string | undefined,
) {
  const currentText = requireThoughtText(thoughtId, sourceText);
  finalizeThought(thoughtId, currentText, thoughtLocation());
  return summarizeThought(thoughtId);
}

function handleThoughtHistoryAction(thoughtId: string) {
  return {
    content: [
      textContent(formatThoughtHistory(loadThought(thoughtId, thoughtLocation()).history)),
    ],
  };
}

function handleThoughtDeleteAction(thoughtId: string) {
  if (!deleteThought(thoughtId, thoughtLocation())) {
    throw new Error(`Thought ${thoughtId} was not found.`);
  }
  return {
    content: [textContent(`Deleted thought: ${thoughtId}\n`)],
  };
}

const REFLECTION_KIND_SCHEMA = z.enum([
  "note",
  "concern",
  "decision",
  "follow_up",
  "audit_response",
]);

const SEMANTIC_AUDIT_VERDICT_SCHEMA = z.enum([
  "supported",
  "unsupported",
  "mixed",
  "unknown",
]);

const AUDIT_SEVERITY_SCHEMA = z.enum(AUDIT_SEVERITIES);
const AUDIT_RESULT_CATEGORY_SCHEMA = z.enum(AUDIT_RESULT_CATEGORIES);

function handleThoughtReflectAction(
  thoughtId: string,
  text: string | undefined,
  kind: ThoughtReflectionKind,
) {
  if (!text) {
    throw new Error("text is required when action=reflect");
  }
  addThoughtReflection(thoughtId, text, kind, thoughtLocation());
  return summarizeThought(thoughtId);
}

function handleThoughtSemanticAuditAction(
  thoughtId: string,
  decisionId: string | undefined,
  supportId: string | undefined,
  verdict: ThoughtSemanticAuditVerdict | undefined,
  reason: string | undefined,
  auditId: string | undefined,
  reviewer: string | undefined,
  model: string | undefined,
  auditedAt: string | undefined,
  sourceThoughtId: string | undefined,
) {
  if (!decisionId || !supportId) {
    throw new Error("decisionId and supportId are required when action=semantic-audit");
  }
  if (!verdict) {
    throw new Error("verdict is required when action=semantic-audit");
  }
  if (!reason) {
    throw new Error("reason is required when action=semantic-audit");
  }

  saveThoughtSemanticAudit(thoughtId, {
    auditId,
    decisionId,
    supportId,
    verdict,
    reason,
    reviewer,
    model,
    auditedAt,
    sourceThoughtId,
  }, thoughtLocation());
  return summarizeThought(thoughtId);
}

async function handleThoughtAction(
  action:
    | "draft"
    | "relate"
    | "audit"
    | "finalize"
    | "reflect"
    | "delete"
    | "show"
    | "history"
    | "search"
    | "list"
    | "semantic-audit",
  thoughtId: string | undefined,
  dslText: string | undefined,
  fromThoughtId: string | undefined,
  text: string | undefined,
  kind: ThoughtReflectionKind,
  query: string | undefined,
  limit: number | undefined,
  includeReflections: boolean,
  decisionId: string | undefined,
  supportId: string | undefined,
  verdict: ThoughtSemanticAuditVerdict | undefined,
  reason: string | undefined,
  auditId: string | undefined,
  reviewer: string | undefined,
  model: string | undefined,
  auditedAt: string | undefined,
  sourceThoughtId: string | undefined,
  view:
    | "summary"
    | "draft"
    | "final"
    | "audit"
    | "reflections"
    | "semantic-audit"
    | "semantic-audit-pairs"
    | undefined,
  outputOptions: AuditReportFormatOptions,
) {
  if (action === "list") {
    return { content: [textContent(formatThoughtList(listThoughts(thoughtLocation())))] };
  }
  if (action === "search") {
    return handleThoughtSearch(query, limit, includeReflections);
  }

  const resolvedThoughtId = requireThoughtId(thoughtId);
  const sourceText = loadThoughtSourceText(
    resolvedThoughtId,
    dslText,
    fromThoughtId,
  );
  switch (action) {
    case "draft":
      return handleThoughtDraftAction(resolvedThoughtId, sourceText);
    case "relate":
      return handleThoughtRelateAction(resolvedThoughtId, fromThoughtId);
    case "audit":
      return handleThoughtAuditAction(
        resolvedThoughtId,
        sourceText,
        outputOptions,
      );
    case "finalize":
      return handleThoughtFinalizeAction(resolvedThoughtId, sourceText);
    case "reflect":
      return handleThoughtReflectAction(resolvedThoughtId, text, kind);
    case "semantic-audit":
      return handleThoughtSemanticAuditAction(
        resolvedThoughtId,
        decisionId,
        supportId,
        verdict,
        reason,
        auditId,
        reviewer,
        model,
        auditedAt,
        sourceThoughtId,
      );
    case "delete":
      return handleThoughtDeleteAction(resolvedThoughtId);
    case "history":
      return handleThoughtHistoryAction(resolvedThoughtId);
    case "show":
      return showThoughtView(resolvedThoughtId, view, outputOptions);
    default:
      throw new Error(`Unsupported action: ${action satisfies never}`);
  }
}

server.tool(
  "dsl",
  "LLMThink DSL operations. Use action=audit to audit and auto-register DSL text, or action=help for syntax guidance.",
  {
    action: z.enum(["audit", "help"]),
    dslText: z.string().optional(),
    filePath: z.string().optional(),
    documentId: z.string().optional(),
    thoughtId: z.string().optional(),
    topic: z.string().optional(),
    subtopic: z.string().optional(),
    detail: z.enum(["index", "quick", "detail"]).optional(),
    maxIssues: z.number().int().positive().max(1000).optional().describe(
      "Maximum number of audit issues to return after output filtering.",
    ),
    minSeverity: AUDIT_SEVERITY_SCHEMA.optional().describe(
      "Minimum audit severity to return, inclusive.",
    ),
    suppressCategories: z.array(AUDIT_RESULT_CATEGORY_SCHEMA).optional().describe(
      "Audit result categories to omit from output.",
    ),
  },
  async ({
    action,
    dslText,
    filePath,
    documentId,
    thoughtId,
    topic,
    subtopic,
    detail,
    maxIssues,
    minSeverity,
    suppressCategories,
  }) => {
    if (isDslHelpAction(action, dslText)) {
      const parsedRequest = dslText ? parseDslHelpRequest(dslText) : undefined;
      return {
        content: [
          textContent(
            getDslSyntaxGuidanceText({
              topic: parsedRequest?.topic ?? topic,
              subtopic: parsedRequest?.subtopic ?? subtopic,
              detail: parsedRequest?.detail ?? detail,
              channel: "mcp",
            }),
          ),
        ],
      };
    }

    if (!dslText && !filePath) {
      throw new Error("dslText or filePath is required when action=audit");
    }

    const persisted = await auditAndPersistThought({
      dslText,
      filePath,
      documentId,
      thoughtId,
    }, {
      fileBaseDir: process.cwd(),
      storageRoot: resolveThoughtStorageRoot({ cwd: process.cwd(), filePath }),
    });
    const outputOptions = auditOutputOptions({
      maxIssues,
      minSeverity,
      suppressCategories,
    });
    const outputReport = limitAuditReport(persisted.report, outputOptions);
    return {
      content: [
        textContent(
          `${formatPersistedThoughtAudit(persisted)}${formatAuditReportText(persisted.report, outputOptions)}`,
        ),
        textContent(
          JSON.stringify(
            {
              thought_id: persisted.thoughtId,
              id_source: persisted.idSource,
              report: outputReport,
            },
            null,
            2,
          ),
        ),
      ],
    };
  },
);

server.tool(
  "thought",
  "LLMThink thought lifecycle operations. Use action=draft|relate|audit|finalize|reflect|semantic-audit|delete|show|history|search|list.",
  {
    action: z.enum([
      "draft",
      "relate",
      "audit",
      "finalize",
      "reflect",
      "semantic-audit",
      "delete",
      "show",
      "history",
      "search",
      "list",
    ]),
    thoughtId: z.string().optional(),
    dslText: z.string().optional(),
    fromThoughtId: z.string().optional(),
    text: z.string().optional(),
    kind: REFLECTION_KIND_SCHEMA.default("note"),
    query: z.string().optional(),
    limit: z.number().int().positive().max(20).optional(),
    maxIssues: z.number().int().positive().max(1000).optional().describe(
      "Maximum number of audit issues for audit output or view=audit.",
    ),
    minSeverity: AUDIT_SEVERITY_SCHEMA.optional().describe(
      "Minimum audit severity for audit output or view=audit, inclusive.",
    ),
    suppressCategories: z.array(AUDIT_RESULT_CATEGORY_SCHEMA).optional().describe(
      "Audit result categories to omit from audit output or view=audit.",
    ),
    includeReflections: z.boolean().default(false),
    decisionId: z.string().optional(),
    supportId: z.string().optional(),
    verdict: SEMANTIC_AUDIT_VERDICT_SCHEMA.optional(),
    reason: z.string().optional(),
    auditId: z.string().optional(),
    reviewer: z.string().optional(),
    model: z.string().optional(),
    auditedAt: z.string().optional(),
    sourceThoughtId: z.string().optional(),
    view: z
      .enum([
        "summary",
        "draft",
        "final",
        "audit",
        "reflections",
        "semantic-audit",
        "semantic-audit-pairs",
      ])
      .optional(),
  },
  async ({
    action,
    thoughtId,
    dslText,
    fromThoughtId,
    text,
    kind,
    query,
    limit,
    maxIssues,
    minSeverity,
    suppressCategories,
    includeReflections,
    decisionId,
    supportId,
    verdict,
    reason,
    auditId,
    reviewer,
    model,
    auditedAt,
    sourceThoughtId,
    view,
  }) => {
    return handleThoughtAction(
      action,
      thoughtId,
      dslText,
      fromThoughtId,
      text,
      kind,
      query,
      limit,
      includeReflections,
      decisionId,
      supportId,
      verdict,
      reason,
      auditId,
      reviewer,
      model,
      auditedAt,
      sourceThoughtId,
      view,
      auditOutputOptions({
        maxIssues,
        minSeverity,
        suppressCategories,
      }),
    );
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
