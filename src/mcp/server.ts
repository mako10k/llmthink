#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { auditDslFile, auditDslText } from "../analyzer/audit.js";
import { getDslSyntaxGuidanceText, isDslHelpRequest } from "../dsl/guidance.js";
import { formatAuditReportText } from "../presentation/report.js";
import {
  formatThoughtHistory,
  formatThoughtList,
  formatThoughtSearchResults,
  formatThoughtSummary,
} from "../presentation/thought.js";
import {
  relateThought,
  finalizeThought,
  listThoughts,
  loadThought,
  recordThoughtAudit,
  draftThought,
  searchThoughtRecords,
} from "../thought/store.js";

const server = new McpServer({
  name: "llmthink",
  version: "0.2.0",
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
  view?: "summary" | "draft" | "final" | "audit",
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
) {
  if (!query) {
    throw new Error("query is required when action=search");
  }
  const results = (await searchThoughtRecords(query)).slice(0, limit ?? 5);
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
  const currentText = requireThoughtText(thoughtId, sourceText);
  if (sourceText) {
    draftThought(thoughtId, currentText);
  }
  const report = await auditDslText(currentText, thoughtId);
  recordThoughtAudit(thoughtId, report);
  return {
    content: [
      textContent(formatAuditReportText(report)),
      textContent(JSON.stringify(report, null, 2)),
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

async function handleThoughtAction(
  action:
    | "draft"
    | "relate"
    | "audit"
    | "finalize"
    | "show"
    | "history"
    | "search"
    | "list",
  thoughtId: string | undefined,
  dslText: string | undefined,
  fromThoughtId: string | undefined,
  query: string | undefined,
  limit: number | undefined,
  view: "summary" | "draft" | "final" | "audit" | undefined,
) {
  if (action === "list") {
    return { content: [textContent(formatThoughtList(listThoughts()))] };
  }
  if (action === "search") {
    return handleThoughtSearch(query, limit);
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
  "LLMThink DSL operations. Use action=audit or action=help.",
  {
    action: z.enum(["audit", "help"]),
    dslText: z.string().optional(),
    filePath: z.string().optional(),
    documentId: z.string().optional(),
  },
  async ({ action, dslText, filePath, documentId }) => {
    if (action === "help" || (dslText && isDslHelpRequest(dslText))) {
      return {
        content: [textContent(getDslSyntaxGuidanceText())],
      };
    }

    if (!dslText && !filePath) {
      throw new Error("dslText or filePath is required when action=audit");
    }

    const report = dslText
      ? await auditDslText(dslText, documentId ?? "mcp-dsl")
      : await auditDslFile(filePath!);
    return {
      content: [
        textContent(formatAuditReportText(report)),
        textContent(JSON.stringify(report, null, 2)),
      ],
    };
  },
);

server.tool(
  "thought",
  "LLMThink thought lifecycle operations. Use action=draft|relate|audit|finalize|show|history|search|list.",
  {
    action: z.enum([
      "draft",
      "relate",
      "audit",
      "finalize",
      "show",
      "history",
      "search",
      "list",
    ]),
    thoughtId: z.string().optional(),
    dslText: z.string().optional(),
    fromThoughtId: z.string().optional(),
    query: z.string().optional(),
    limit: z.number().int().positive().max(20).optional(),
    view: z.enum(["summary", "draft", "final", "audit"]).optional(),
  },
  async ({ action, thoughtId, dslText, fromThoughtId, query, limit, view }) => {
    return handleThoughtAction(
      action,
      thoughtId,
      dslText,
      fromThoughtId,
      query,
      limit,
      view,
    );
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
