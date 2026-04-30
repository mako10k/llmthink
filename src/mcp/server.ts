#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { auditDslFile, auditDslText } from "../analyzer/audit.js";
import { getDslSyntaxGuidanceText, isDslHelpRequest } from "../dsl/guidance.js";
import { formatAuditReportText } from "../presentation/report.js";
import { formatThoughtHistory, formatThoughtList, formatThoughtSearchResults, formatThoughtSummary } from "../presentation/thought.js";
import { relateThought, finalizeThought, listThoughts, loadThought, recordThoughtAudit, draftThought, searchThoughtRecords } from "../thought/store.js";

const server = new McpServer({
  name: "llmthink",
  version: "0.2.0",
});

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
        content: [{ type: "text", text: getDslSyntaxGuidanceText() }],
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
        { type: "text", text: formatAuditReportText(report) },
        { type: "text", text: JSON.stringify(report, null, 2) },
      ],
    };
  },
);

server.tool(
  "thought",
  "LLMThink thought lifecycle operations. Use action=draft|relate|audit|finalize|show|history|search|list.",
  {
    action: z.enum(["draft", "relate", "audit", "finalize", "show", "history", "search", "list"]),
    thoughtId: z.string().optional(),
    dslText: z.string().optional(),
    fromThoughtId: z.string().optional(),
    query: z.string().optional(),
    limit: z.number().int().positive().max(20).optional(),
    view: z.enum(["summary", "draft", "final", "audit"]).optional(),
  },
  async ({ action, thoughtId, dslText, fromThoughtId, query, limit, view }) => {
    if (action === "list") {
      return { content: [{ type: "text", text: formatThoughtList(listThoughts()) }] };
    }

    if (action === "search") {
      if (!query) {
        throw new Error("query is required when action=search");
      }
      const results = (await searchThoughtRecords(query)).slice(0, limit ?? 5);
      return { content: [{ type: "text", text: formatThoughtSearchResults(results) }] };
    }

    if (!thoughtId) {
      throw new Error("thoughtId is required for this action");
    }

    const sourceText = dslText ?? (fromThoughtId ? (loadThought(fromThoughtId).finalText ?? loadThought(fromThoughtId).draftText) : undefined);

    if (action === "draft") {
      if (!sourceText) {
        throw new Error("dslText or fromThoughtId is required when action=draft");
      }
      draftThought(thoughtId, sourceText);
      return { content: [{ type: "text", text: formatThoughtSummary(loadThought(thoughtId)) }] };
    }

    if (action === "relate") {
      if (!fromThoughtId) {
        throw new Error("fromThoughtId is required when action=relate");
      }
      relateThought(thoughtId, fromThoughtId);
      return { content: [{ type: "text", text: formatThoughtSummary(loadThought(thoughtId)) }] };
    }

    if (action === "audit") {
      const currentText = sourceText ?? loadThought(thoughtId).draftText ?? loadThought(thoughtId).finalText;
      if (!currentText) {
        throw new Error("No draft or final text exists for this thought");
      }
      if (sourceText) {
        draftThought(thoughtId, currentText);
      }
      const report = await auditDslText(currentText, thoughtId);
      recordThoughtAudit(thoughtId, report);
      return {
        content: [
          { type: "text", text: formatAuditReportText(report) },
          { type: "text", text: JSON.stringify(report, null, 2) },
        ],
      };
    }

    if (action === "finalize") {
      const currentText = sourceText ?? loadThought(thoughtId).draftText ?? loadThought(thoughtId).finalText;
      if (!currentText) {
        throw new Error("No draft or final text exists for this thought");
      }
      finalizeThought(thoughtId, currentText);
      return { content: [{ type: "text", text: formatThoughtSummary(loadThought(thoughtId)) }] };
    }

    if (action === "history") {
      return { content: [{ type: "text", text: formatThoughtHistory(loadThought(thoughtId).history) }] };
    }

    const snapshot = loadThought(thoughtId);
    if (view === "draft") {
      return { content: [{ type: "text", text: snapshot.draftText ?? "" }] };
    }
    if (view === "final") {
      return { content: [{ type: "text", text: snapshot.finalText ?? "" }] };
    }
    if (view === "audit") {
      return { content: [{ type: "text", text: snapshot.latestAudit ? formatAuditReportText(snapshot.latestAudit) : "No audit yet.\n" }] };
    }
    return { content: [{ type: "text", text: formatThoughtSummary(snapshot) }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);