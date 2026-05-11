#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { resolveThoughtStorageRoot } from "../config/runtime.js";
import { getDslSyntaxGuidanceText, isDslHelpRequest, parseDslHelpRequest, } from "../dsl/guidance.js";
import { formatAuditReportText, limitAuditReport } from "../presentation/report.js";
import { formatPersistedThoughtAudit, formatThoughtHistory, formatThoughtList, formatThoughtReflections, formatThoughtSearchResults, formatThoughtSemanticAuditPairs, formatThoughtSemanticAuditSummary, formatThoughtSummary, } from "../presentation/thought.js";
import { addThoughtReflection, deleteThought, relateThought, finalizeThought, listThoughts, loadThought, draftThought, saveThoughtSemanticAudit, searchThoughtRecords, } from "../thought/store.js";
import { auditAndPersistThought } from "../thought/workflow.js";
const server = new McpServer({
    name: "llmthink",
    version: "0.4.3",
});
function thoughtLocation(filePath) {
    return {
        storageRoot: resolveThoughtStorageRoot({
            cwd: process.cwd(),
            filePath,
        }),
    };
}
function textContent(text) {
    return { type: "text", text };
}
function loadThoughtSourceText(thoughtId, dslText, fromThoughtId) {
    if (dslText) {
        return dslText;
    }
    if (!fromThoughtId) {
        return undefined;
    }
    const source = loadThought(fromThoughtId, thoughtLocation());
    return source.finalText ?? source.draftText;
}
function getStoredThoughtText(thoughtId) {
    const thought = loadThought(thoughtId, thoughtLocation());
    return thought.draftText ?? thought.finalText;
}
function showThoughtView(thoughtId, view) {
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
                textContent(snapshot.latestAudit
                    ? formatAuditReportText(snapshot.latestAudit)
                    : "No audit yet.\n"),
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
function summarizeThought(thoughtId) {
    return {
        content: [textContent(formatThoughtSummary(loadThought(thoughtId, thoughtLocation())))],
    };
}
async function handleThoughtSearch(query, limit, includeReflections) {
    if (!query) {
        throw new Error("query is required when action=search");
    }
    const results = (await searchThoughtRecords(query, thoughtLocation(), { includeReflections })).slice(0, limit ?? 5);
    return { content: [textContent(formatThoughtSearchResults(results))] };
}
function requireThoughtId(thoughtId) {
    if (!thoughtId) {
        throw new Error("thoughtId is required for this action");
    }
    return thoughtId;
}
function requireThoughtText(thoughtId, sourceText) {
    const currentText = sourceText ?? getStoredThoughtText(thoughtId);
    if (!currentText) {
        throw new Error("No draft or final text exists for this thought");
    }
    return currentText;
}
function handleThoughtDraftAction(thoughtId, sourceText) {
    if (!sourceText) {
        throw new Error("dslText or fromThoughtId is required when action=draft");
    }
    draftThought(thoughtId, sourceText, thoughtLocation());
    return summarizeThought(thoughtId);
}
function handleThoughtRelateAction(thoughtId, fromThoughtId) {
    if (!fromThoughtId) {
        throw new Error("fromThoughtId is required when action=relate");
    }
    relateThought(thoughtId, fromThoughtId, thoughtLocation());
    return summarizeThought(thoughtId);
}
async function handleThoughtAuditAction(thoughtId, sourceText) {
    const persisted = await auditAndPersistThought({
        dslText: requireThoughtText(thoughtId, sourceText),
        thoughtId,
    }, {
        fileBaseDir: process.cwd(),
        storageRoot: resolveThoughtStorageRoot({ cwd: process.cwd() }),
    });
    return {
        content: [
            textContent(`${formatPersistedThoughtAudit(persisted)}${formatAuditReportText(persisted.report)}`),
            textContent((() => {
                const outputReport = limitAuditReport(persisted.report);
                return JSON.stringify({
                    thought_id: persisted.thoughtId,
                    id_source: persisted.idSource,
                    report: outputReport,
                }, null, 2);
            })()),
        ],
    };
}
function handleThoughtFinalizeAction(thoughtId, sourceText) {
    const currentText = requireThoughtText(thoughtId, sourceText);
    finalizeThought(thoughtId, currentText, thoughtLocation());
    return summarizeThought(thoughtId);
}
function handleThoughtHistoryAction(thoughtId) {
    return {
        content: [
            textContent(formatThoughtHistory(loadThought(thoughtId, thoughtLocation()).history)),
        ],
    };
}
function handleThoughtDeleteAction(thoughtId) {
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
function handleThoughtReflectAction(thoughtId, text, kind) {
    if (!text) {
        throw new Error("text is required when action=reflect");
    }
    addThoughtReflection(thoughtId, text, kind, thoughtLocation());
    return summarizeThought(thoughtId);
}
function handleThoughtSemanticAuditAction(thoughtId, decisionId, supportId, verdict, reason, auditId, reviewer, model, auditedAt, sourceThoughtId) {
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
async function handleThoughtAction(action, thoughtId, dslText, fromThoughtId, text, kind, query, limit, includeReflections, decisionId, supportId, verdict, reason, auditId, reviewer, model, auditedAt, sourceThoughtId, view) {
    if (action === "list") {
        return { content: [textContent(formatThoughtList(listThoughts(thoughtLocation())))] };
    }
    if (action === "search") {
        return handleThoughtSearch(query, limit, includeReflections);
    }
    const resolvedThoughtId = requireThoughtId(thoughtId);
    const sourceText = loadThoughtSourceText(resolvedThoughtId, dslText, fromThoughtId);
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
        case "semantic-audit":
            return handleThoughtSemanticAuditAction(resolvedThoughtId, decisionId, supportId, verdict, reason, auditId, reviewer, model, auditedAt, sourceThoughtId);
        case "delete":
            return handleThoughtDeleteAction(resolvedThoughtId);
        case "history":
            return handleThoughtHistoryAction(resolvedThoughtId);
        case "show":
            return showThoughtView(resolvedThoughtId, view);
        default:
            throw new Error(`Unsupported action: ${action}`);
    }
}
server.tool("dsl", "LLMThink DSL operations. Use action=audit to audit and auto-register DSL text, or action=help for syntax guidance.", {
    action: z.enum(["audit", "help"]),
    dslText: z.string().optional(),
    filePath: z.string().optional(),
    documentId: z.string().optional(),
    thoughtId: z.string().optional(),
    topic: z.string().optional(),
    subtopic: z.string().optional(),
    detail: z.enum(["index", "quick", "detail"]).optional(),
}, async ({ action, dslText, filePath, documentId, thoughtId, topic, subtopic, detail }) => {
    if (action === "help" || (dslText && isDslHelpRequest(dslText))) {
        const parsedRequest = dslText ? parseDslHelpRequest(dslText) : undefined;
        return {
            content: [
                textContent(getDslSyntaxGuidanceText({
                    topic: parsedRequest?.topic ?? topic,
                    subtopic: parsedRequest?.subtopic ?? subtopic,
                    detail: parsedRequest?.detail ?? detail,
                    channel: "mcp",
                })),
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
    return {
        content: [
            textContent(`${formatPersistedThoughtAudit(persisted)}${formatAuditReportText(persisted.report)}`),
            textContent(JSON.stringify({
                thought_id: persisted.thoughtId,
                id_source: persisted.idSource,
                report: persisted.report,
            }, null, 2)),
        ],
    };
});
server.tool("thought", "LLMThink thought lifecycle operations. Use action=draft|relate|audit|finalize|reflect|semantic-audit|delete|show|history|search|list.", {
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
}, async ({ action, thoughtId, dslText, fromThoughtId, text, kind, query, limit, includeReflections, decisionId, supportId, verdict, reason, auditId, reviewer, model, auditedAt, sourceThoughtId, view, }) => {
    return handleThoughtAction(action, thoughtId, dslText, fromThoughtId, text, kind, query, limit, includeReflections, decisionId, supportId, verdict, reason, auditId, reviewer, model, auditedAt, sourceThoughtId, view);
});
const transport = new StdioServerTransport();
await server.connect(transport);
//# sourceMappingURL=server.js.map