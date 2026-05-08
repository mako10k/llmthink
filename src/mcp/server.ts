#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  getDslSyntaxGuidanceText,
  isDslHelpRequest,
  parseDslHelpRequest,
} from "../dsl/guidance.js";
import { formatAuditReportText } from "../presentation/report.js";
import {
  formatPersistedThoughtAudit,
  formatThoughtHistory,
  formatThoughtList,
  formatThoughtReflections,
  formatThoughtSearchResults,
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
  searchThoughtRecords,
  type ThoughtReflectionKind,
} from "../thought/store.js";
import { auditAndPersistThought } from "../thought/workflow.js";

const server = new McpServer({
  name: "llmthink",
  version: "0.3.21",
});

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
  const source = loadThought(fromThoughtId);
  return source.finalText ?? source.draftText;
}

function getStoredThoughtText(thoughtId: string): string | undefined {
  const thought = loadThought(thoughtId);
  return thought.draftText ?? thought.finalText;
}

function showThoughtView(
  thoughtId: string,
  view?: "summary" | "draft" | "final" | "audit" | "reflections",
) {
  const snapshot = loadThought(thoughtId);
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
            ? formatAuditReportText(snapshot.latestAudit)
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
  return { content: [textContent(formatThoughtSummary(snapshot))] };
}

function summarizeThought(thoughtId: string) {
  return {
    content: [textContent(formatThoughtSummary(loadThought(thoughtId)))],
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
    await searchThoughtRecords(query, undefined, { includeReflections })
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
  draftThought(thoughtId, sourceText);
  return summarizeThought(thoughtId);
}

function handleThoughtRelateAction(
  thoughtId: string,
  fromThoughtId: string | undefined,
) {
  if (!fromThoughtId) {
    throw new Error("fromThoughtId is required when action=relate");
  }
  relateThought(thoughtId, fromThoughtId);
  return summarizeThought(thoughtId);
}

async function handleThoughtAuditAction(
  thoughtId: string,
  sourceText: string | undefined,
) {
  const persisted = await auditAndPersistThought({
    dslText: requireThoughtText(thoughtId, sourceText),
    thoughtId,
  });
  return {
    content: [
      textContent(
        `${formatPersistedThoughtAudit(persisted)}${formatAuditReportText(persisted.report)}`,
      ),
      textContent(
        JSON.stringify(
          {
            thought_id: persisted.thoughtId,
            id_source: persisted.idSource,
            report: persisted.report,
          },
          null,
          2,
        ),
      ),
    ],
  };
}

function handleThoughtFinalizeAction(
  thoughtId: string,
  sourceText: string | undefined,
) {
  const currentText = requireThoughtText(thoughtId, sourceText);
  finalizeThought(thoughtId, currentText);
  return summarizeThought(thoughtId);
}

function handleThoughtHistoryAction(thoughtId: string) {
  return {
    content: [
      textContent(formatThoughtHistory(loadThought(thoughtId).history)),
    ],
  };
}

function handleThoughtDeleteAction(thoughtId: string) {
  if (!deleteThought(thoughtId)) {
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

function handleThoughtReflectAction(
  thoughtId: string,
  text: string | undefined,
  kind: ThoughtReflectionKind,
) {
  if (!text) {
    throw new Error("text is required when action=reflect");
  }
  addThoughtReflection(thoughtId, text, kind);
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
    | "list",
  thoughtId: string | undefined,
  dslText: string | undefined,
  fromThoughtId: string | undefined,
  text: string | undefined,
  kind: ThoughtReflectionKind,
  query: string | undefined,
  limit: number | undefined,
  includeReflections: boolean,
  view: "summary" | "draft" | "final" | "audit" | "reflections" | undefined,
) {
  if (action === "list") {
    return { content: [textContent(formatThoughtList(listThoughts()))] };
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
      return handleThoughtAuditAction(resolvedThoughtId, sourceText);
    case "finalize":
      return handleThoughtFinalizeAction(resolvedThoughtId, sourceText);
    case "reflect":
      return handleThoughtReflectAction(resolvedThoughtId, text, kind);
    case "delete":
      return handleThoughtDeleteAction(resolvedThoughtId);
    case "history":
      return handleThoughtHistoryAction(resolvedThoughtId);
    case "show":
      return showThoughtView(resolvedThoughtId, view);
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
  },
  async ({ action, dslText, filePath, documentId, thoughtId, topic, subtopic, detail }) => {
    if (action === "help" || (dslText && isDslHelpRequest(dslText))) {
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
    });
    return {
      content: [
        textContent(
          `${formatPersistedThoughtAudit(persisted)}${formatAuditReportText(persisted.report)}`,
        ),
        textContent(
          JSON.stringify(
            {
              thought_id: persisted.thoughtId,
              id_source: persisted.idSource,
              report: persisted.report,
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
  "LLMThink thought lifecycle operations. Use action=draft|relate|audit|finalize|reflect|delete|show|history|search|list.",
  {
    action: z.enum([
      "draft",
      "relate",
      "audit",
      "finalize",
      "reflect",
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
    includeReflections: z.boolean().default(false),
    view: z
      .enum(["summary", "draft", "final", "audit", "reflections"])
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
    includeReflections,
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
      view,
    );
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
