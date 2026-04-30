import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { auditFile, auditText } from "../analyzer/audit.js";
import { getDslSyntaxGuidanceText, isDslHelpRequest } from "../dsl/guidance.js";
import { formatAuditReportText } from "../presentation/report.js";
import { formatThoughtHistory, formatThoughtList, formatThoughtSearchResults, formatThoughtSummary } from "../presentation/thought.js";
import { finalizeThought, listThoughts, loadThought, persistAuditReport, saveThoughtDraft, searchThoughts } from "../thought/store.js";

const server = new McpServer({
  name: "llmthink",
  version: "0.1.0",
});

server.tool(
  "audit_text",
  "Audit DSL text and return a thought-audit report. For grammar help, pass text as 'help dsl'.",
  {
    text: z.string().min(1),
    documentId: z.string().optional(),
  },
  async ({ text, documentId }) => {
    if (isDslHelpRequest(text)) {
      return {
        content: [
          {
            type: "text",
            text: getDslSyntaxGuidanceText(),
          },
        ],
      };
    }

    const report = await auditText(text, documentId ?? "mcp-text");
    return {
      content: [
        {
          type: "text",
          text: formatAuditReportText(report),
        },
        {
          type: "text",
          text: JSON.stringify(report, null, 2),
        },
      ],
    };
  },
);

server.tool(
  "audit_file",
  "Audit a DSL file on disk and return a thought-audit report.",
  {
    filePath: z.string().min(1),
  },
  async ({ filePath }) => {
    const report = await auditFile(filePath);
    return {
      content: [
        {
          type: "text",
          text: formatAuditReportText(report),
        },
        {
          type: "text",
          text: JSON.stringify(report, null, 2),
        },
      ],
    };
  },
);

server.tool(
  "thought_manage",
  "Manage persisted thought lifecycle. Use action draft|audit|finalize|show|history|list.",
  {
    action: z.enum(["draft", "audit", "finalize", "show", "history", "list"]),
    thoughtId: z.string().optional(),
    text: z.string().optional(),
    fromThoughtId: z.string().optional(),
    view: z.enum(["summary", "draft", "final", "audit"]).optional(),
  },
  async ({ action, thoughtId, text, fromThoughtId, view }) => {
    if (action === "list") {
      const thoughts = listThoughts();
      return {
        content: [{ type: "text", text: formatThoughtList(thoughts) }],
      };
    }

    if (!thoughtId) {
      throw new Error("thoughtId is required unless action=list");
    }

    const sourceText = text ?? (fromThoughtId ? (loadThought(fromThoughtId).finalText ?? loadThought(fromThoughtId).draftText) : undefined);
    if ((action === "draft" || action === "audit" || action === "finalize") && !sourceText && !["audit"].includes(action)) {
      throw new Error("text or fromThoughtId is required for this action");
    }

    if (action === "draft") {
      saveThoughtDraft(thoughtId, sourceText ?? "");
      return {
        content: [{ type: "text", text: formatThoughtSummary(loadThought(thoughtId)) }],
      };
    }

    if (action === "audit") {
      const currentText = sourceText ?? loadThought(thoughtId).draftText ?? loadThought(thoughtId).finalText;
      if (!currentText) {
        throw new Error("No draft or final text exists for this thought");
      }
      if (sourceText) {
        saveThoughtDraft(thoughtId, currentText);
      }
      const report = await auditText(currentText, thoughtId);
      persistAuditReport(thoughtId, report);
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
      return {
        content: [{ type: "text", text: formatThoughtSummary(loadThought(thoughtId)) }],
      };
    }

    if (action === "history") {
      return {
        content: [{ type: "text", text: formatThoughtHistory(loadThought(thoughtId).history) }],
      };
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
    return {
      content: [{ type: "text", text: formatThoughtSummary(snapshot) }],
    };
  },
);

server.tool(
  "thought_search",
  "Search persisted thoughts and suggest related thought creation.",
  {
    query: z.string().min(1),
    limit: z.number().int().positive().max(20).optional(),
  },
  async ({ query, limit }) => {
    const results = (await searchThoughts(query)).slice(0, limit ?? 5);
    return {
      content: [{ type: "text", text: formatThoughtSearchResults(results) }],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);