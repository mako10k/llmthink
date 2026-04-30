import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { auditFile, auditText } from "../analyzer/audit.js";
import { formatAuditReportText } from "../presentation/report.js";

const server = new McpServer({
  name: "llmthink",
  version: "0.1.0",
});

server.tool(
  "audit_text",
  "Audit DSL text and return a thought-audit report.",
  {
    text: z.string().min(1),
    documentId: z.string().optional(),
  },
  async ({ text, documentId }) => {
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

const transport = new StdioServerTransport();
await server.connect(transport);