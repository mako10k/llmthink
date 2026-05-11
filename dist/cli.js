#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveRuntimeConfig, resolveThoughtStorageRoot, } from "./config/runtime.js";
import { getDslSyntaxGuidanceText } from "./dsl/guidance.js";
import { formatAuditReportText, limitAuditReport } from "./presentation/report.js";
import { formatPersistedThoughtAudit, formatThoughtHistory, formatThoughtList, formatThoughtReflections, formatThoughtSearchResults, formatThoughtSemanticAuditPairs, formatThoughtSemanticAuditSummary, formatThoughtSummary, } from "./presentation/thought.js";
import { addThoughtReflection, deleteThought, relateThought, finalizeThought, listThoughts, loadThought, draftThought, saveThoughtSemanticAudit, searchThoughtRecords, } from "./thought/store.js";
import { auditAndPersistThought } from "./thought/workflow.js";
const OPTION_MUTATORS = {
    "--pretty": (options) => {
        options.pretty = true;
    },
    "--text": (options, remainingArgs) => {
        options.text = remainingArgs.shift() ?? "";
    },
    "--id": (options, remainingArgs) => {
        const value = remainingArgs.shift() ?? "document";
        options.documentId = value;
        options.thoughtId = value;
    },
    "--from": (options, remainingArgs) => {
        options.fromThoughtId = remainingArgs.shift();
    },
    "--kind": (options, remainingArgs) => {
        options.kind = remainingArgs.shift();
    },
    "--with-reflections": (options) => {
        options.includeReflections = true;
    },
    "--limit": (options, remainingArgs) => {
        const rawValue = remainingArgs.shift();
        const parsed = Number(rawValue);
        options.limit = Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    },
    "--audit-id": (options, remainingArgs) => {
        options.auditId = remainingArgs.shift();
    },
    "--decision": (options, remainingArgs) => {
        options.decisionId = remainingArgs.shift();
    },
    "--support": (options, remainingArgs) => {
        options.supportId = remainingArgs.shift();
    },
    "--verdict": (options, remainingArgs) => {
        options.verdict = remainingArgs.shift();
    },
    "--reason": (options, remainingArgs) => {
        options.reason = remainingArgs.shift();
    },
    "--reviewer": (options, remainingArgs) => {
        options.reviewer = remainingArgs.shift();
    },
    "--model": (options, remainingArgs) => {
        options.model = remainingArgs.shift();
    },
    "--audited-at": (options, remainingArgs) => {
        options.auditedAt = remainingArgs.shift();
    },
    "--source-thought": (options, remainingArgs) => {
        options.sourceThoughtId = remainingArgs.shift();
    },
    "--config": (options, remainingArgs) => {
        options.configFilePath = remainingArgs.shift();
    },
    "--storage-domain": (options, remainingArgs) => {
        const value = remainingArgs.shift();
        if (value === "workspace" || value === "user" || value === "system") {
            options.storageDomain = value;
        }
    },
    "--storage-path": (options, remainingArgs) => {
        options.storagePath = remainingArgs.shift();
    },
};
function isThoughtIdRequired(subcommand) {
    return [
        "draft",
        "relate",
        "audit",
        "finalize",
        "semantic-audit",
        "show",
        "history",
        "reflect",
        "delete",
    ].includes(subcommand ?? "");
}
const REFLECTION_KINDS = [
    "note",
    "concern",
    "decision",
    "follow_up",
    "audit_response",
];
function resolveReflectionKind(kind) {
    if (!kind) {
        return "note";
    }
    if (REFLECTION_KINDS.includes(kind)) {
        return kind;
    }
    throw new Error(`Invalid --kind value: ${kind}. Use one of ${REFLECTION_KINDS.join(", ")}.`);
}
const SEMANTIC_AUDIT_VERDICTS = [
    "supported",
    "unsupported",
    "mixed",
    "unknown",
];
function resolveSemanticAuditVerdict(verdict) {
    if (!verdict) {
        throw new Error(`semantic-audit requires --verdict. Use one of ${SEMANTIC_AUDIT_VERDICTS.join(", ")}.`);
    }
    if (SEMANTIC_AUDIT_VERDICTS.includes(verdict)) {
        return verdict;
    }
    throw new Error(`Invalid --verdict value: ${verdict}. Use one of ${SEMANTIC_AUDIT_VERDICTS.join(", ")}.`);
}
function parseArgs(argv) {
    const args = [...argv];
    const command = args.shift();
    const subcommand = args[0]?.startsWith("--") ? undefined : args.shift();
    const options = {
        command,
        subcommand,
        pretty: false,
        includeReflections: false,
        positionals: [],
    };
    while (args.length > 0) {
        const arg = args.shift();
        if (!arg)
            break;
        const mutator = OPTION_MUTATORS[arg];
        if (mutator) {
            mutator(options, args);
            continue;
        }
        options.positionals.push(arg);
    }
    if (command === "thought" &&
        subcommand === "show" &&
        options.positionals.length > 0) {
        options.view = options.positionals[0];
    }
    return options;
}
function printUsage() {
    process.stdout.write([
        "Usage:",
        "  llmthink dsl audit <file> [--pretty] [--limit 50]",
        '  llmthink dsl audit --text "...dsl..." [--id document-id] [--pretty] [--limit 50]',
        "  llmthink dsl help [topic] [subtopic] [index|quick|detail]",
        '  llmthink thought draft --id <thought-id> [<file> | --text "...dsl..."] [--from source-thought-id]',
        "  llmthink thought relate --id <thought-id> --from source-thought-id",
        '  llmthink thought audit --id <thought-id> [<file> | --text "...dsl..."] [--pretty] [--limit 50]',
        '  llmthink thought finalize --id <thought-id> [<file> | --text "...dsl..."]',
        '  llmthink thought reflect --id <thought-id> --text "...comment..." [--kind note]',
        '  llmthink thought semantic-audit --id <thought-id> --decision D1 --support E1 --verdict supported --reason "..." [--reviewer name] [--model name]',
        "  llmthink thought delete --id <thought-id>",
        "  llmthink thought show --id <thought-id> [summary|draft|final|audit|reflections|semantic-audit|semantic-audit-pairs]",
        "  llmthink thought history --id <thought-id>",
        "  llmthink thought search <query> [--limit 5] [--with-reflections]",
        "  llmthink thought list",
        "  llmthink config show [<file>]",
        "  global options: [--config path/to/.llmthinkrc] [--storage-domain workspace|user|system] [--storage-path path/to/storage-root]",
    ].join("\n") + "\n");
}
function maskSecret(secret) {
    if (!secret) {
        return undefined;
    }
    if (secret.length <= 8) {
        return `${secret.slice(0, 1)}***${secret.slice(-1)}`;
    }
    return `${secret.slice(0, 4)}***${secret.slice(-4)}`;
}
function printResolvedConfig(options) {
    const filePath = options.positionals[0];
    const runtimeConfig = resolveRuntimeConfig({
        cwd: process.cwd(),
        filePath,
        configFilePath: options.configFilePath,
        storageDomain: options.storageDomain,
        storagePath: options.storagePath,
    });
    process.stdout.write(`${JSON.stringify({
        config_paths: runtimeConfig.configPaths,
        storage: runtimeConfig.storage,
        sources: runtimeConfig.sources,
        embeddings: {
            ...runtimeConfig.embeddings,
            openaiApiKey: maskSecret(runtimeConfig.embeddings.openaiApiKey),
            openaiApiKeyConfigured: Boolean(runtimeConfig.embeddings.openaiApiKey),
        },
    }, null, 2)}\n`);
}
function resolveCliStorageRoot(options, filePath) {
    return resolveThoughtStorageRoot({
        cwd: process.cwd(),
        filePath,
        configFilePath: options.configFilePath,
        storageDomain: options.storageDomain,
        storagePath: options.storagePath,
    });
}
function thoughtLocation(options, filePath) {
    return { storageRoot: resolveCliStorageRoot(options, filePath) };
}
function printThoughtSummary(id, options) {
    process.stdout.write(formatThoughtSummary(loadThought(id, thoughtLocation(options))));
}
function printThoughtHistory(id, options) {
    process.stdout.write(formatThoughtHistory(loadThought(id, thoughtLocation(options)).history));
}
async function printThoughtSearch(query, options, limit = 5, includeReflections = false) {
    const results = (await searchThoughtRecords(query, thoughtLocation(options), { includeReflections })).slice(0, limit);
    process.stdout.write(formatThoughtSearchResults(results));
}
function printThoughtList(options) {
    process.stdout.write(formatThoughtList(listThoughts(thoughtLocation(options))));
}
function readTextFromSource(options) {
    if (options.text) {
        return options.text;
    }
    if (options.positionals.length > 0) {
        return readFileSync(resolve(process.cwd(), options.positionals[0] ?? ""), "utf8");
    }
    if (options.fromThoughtId) {
        const source = loadThought(options.fromThoughtId, thoughtLocation(options));
        return source.finalText ?? source.draftText;
    }
    return undefined;
}
function readCurrentThoughtDraft(id, options) {
    const snapshot = loadThought(id, thoughtLocation(options));
    const text = snapshot.draftText ?? snapshot.finalText;
    if (!text) {
        throw new Error(`Thought ${id} does not have a draft or final text yet.`);
    }
    return text;
}
async function handleDslCommand(options) {
    if (options.subcommand === "help") {
        const last = options.positionals.at(-1);
        const detail = last === "index" || last === "quick" || last === "detail"
            ? last
            : undefined;
        process.stdout.write(getDslSyntaxGuidanceText({
            topic: options.positionals[0],
            subtopic: options.positionals[1],
            detail,
            channel: "cli",
        }));
        return;
    }
    if (options.subcommand !== "audit") {
        printUsage();
        process.exit(1);
    }
    const filePath = options.positionals[0];
    if (!filePath && !options.text) {
        printUsage();
        process.exit(1);
    }
    const persisted = await auditAndPersistThought({
        dslText: options.text,
        filePath,
        thoughtId: options.thoughtId,
        documentId: options.documentId,
    }, {
        fileBaseDir: process.cwd(),
        storageRoot: resolveCliStorageRoot(options, filePath),
    });
    if (options.pretty) {
        process.stdout.write(formatPersistedThoughtAudit(persisted));
        process.stdout.write(formatAuditReportText(persisted.report, { maxIssues: options.limit }));
    }
    else {
        const outputReport = limitAuditReport(persisted.report, {
            maxIssues: options.limit,
        });
        process.stdout.write(`${JSON.stringify({
            thought_id: persisted.thoughtId,
            id_source: persisted.idSource,
            report: outputReport,
        }, null, 2)}\n`);
    }
}
async function handleThoughtCommand(options) {
    const thoughtId = options.thoughtId;
    if (isThoughtIdRequired(options.subcommand) && !thoughtId) {
        throw new Error("--id <thought-id> is required for this thought command.");
    }
    switch (options.subcommand) {
        case "draft":
            return handleThoughtDraft(thoughtId, options);
        case "relate":
            return handleThoughtRelate(thoughtId, options);
        case "audit":
            return handleThoughtAudit(thoughtId, options);
        case "finalize":
            return handleThoughtFinalize(thoughtId, options);
        case "semantic-audit":
            return handleThoughtSemanticAudit(thoughtId, options);
        case "reflect":
            return handleThoughtReflect(thoughtId, options);
        case "delete":
            return handleThoughtDelete(thoughtId, options);
        case "show":
            return handleThoughtShow(thoughtId, options);
        case "history":
            return handleThoughtHistory(thoughtId, options);
        case "search":
            return handleThoughtSearch(options);
        case "list":
            return handleThoughtList(options);
        default:
            printUsage();
            process.exit(1);
    }
}
function handleThoughtDraft(thoughtId, options) {
    const text = readTextFromSource(options);
    if (!text) {
        throw new Error("draft requires <file>, --text, or --from <thought-id>.");
    }
    draftThought(thoughtId, text, thoughtLocation(options));
    printThoughtSummary(thoughtId, options);
}
function handleThoughtRelate(thoughtId, options) {
    if (!options.fromThoughtId) {
        throw new Error("relate requires --from <source-thought-id>.");
    }
    relateThought(thoughtId, options.fromThoughtId, thoughtLocation(options));
    printThoughtSummary(thoughtId, options);
}
async function handleThoughtAudit(thoughtId, options) {
    const text = readTextFromSource(options);
    const persisted = await auditAndPersistThought({
        dslText: text ?? readCurrentThoughtDraft(thoughtId, options),
        thoughtId,
    }, {
        fileBaseDir: process.cwd(),
        storageRoot: resolveCliStorageRoot(options),
    });
    if (options.pretty) {
        process.stdout.write(formatPersistedThoughtAudit(persisted));
        process.stdout.write(formatAuditReportText(persisted.report, { maxIssues: options.limit }));
        return;
    }
    const outputReport = limitAuditReport(persisted.report, {
        maxIssues: options.limit,
    });
    process.stdout.write(`${JSON.stringify({
        thought_id: persisted.thoughtId,
        id_source: persisted.idSource,
        report: outputReport,
    }, null, 2)}\n`);
}
function handleThoughtFinalize(thoughtId, options) {
    const text = readTextFromSource(options) ?? readCurrentThoughtDraft(thoughtId, options);
    finalizeThought(thoughtId, text, thoughtLocation(options));
    printThoughtSummary(thoughtId, options);
}
function handleThoughtReflect(thoughtId, options) {
    const text = options.text ?? options.positionals.join(" ");
    if (!text) {
        throw new Error("reflect requires --text or trailing text.");
    }
    addThoughtReflection(thoughtId, text, resolveReflectionKind(options.kind), thoughtLocation(options));
    printThoughtSummary(thoughtId, options);
}
function handleThoughtSemanticAudit(thoughtId, options) {
    if (!options.decisionId || !options.supportId) {
        throw new Error("semantic-audit requires --decision and --support.");
    }
    if (!options.reason) {
        throw new Error("semantic-audit requires --reason.");
    }
    saveThoughtSemanticAudit(thoughtId, {
        auditId: options.auditId,
        decisionId: options.decisionId,
        supportId: options.supportId,
        verdict: resolveSemanticAuditVerdict(options.verdict),
        reason: options.reason,
        reviewer: options.reviewer,
        model: options.model,
        auditedAt: options.auditedAt,
        sourceThoughtId: options.sourceThoughtId,
    }, thoughtLocation(options));
    printThoughtSummary(thoughtId, options);
}
function handleThoughtDelete(thoughtId, options) {
    if (!deleteThought(thoughtId, thoughtLocation(options))) {
        throw new Error(`Thought ${thoughtId} was not found.`);
    }
    process.stdout.write(`Deleted thought: ${thoughtId}\n`);
}
function handleThoughtShow(thoughtId, options) {
    const snapshot = loadThought(thoughtId, thoughtLocation(options));
    const view = options.view ?? "summary";
    let viewText;
    if (view === "draft") {
        viewText = snapshot.draftText ?? "";
    }
    else if (view === "final") {
        viewText = snapshot.finalText ?? "";
    }
    else if (view === "audit") {
        viewText = snapshot.latestAudit
            ? formatAuditReportText(snapshot.latestAudit)
            : "No audit yet.\n";
    }
    else if (view === "reflections") {
        viewText = formatThoughtReflections(snapshot.reflections);
    }
    else if (view === "semantic-audit") {
        viewText = formatThoughtSemanticAuditSummary(snapshot);
    }
    else if (view === "semantic-audit-pairs") {
        viewText = formatThoughtSemanticAuditPairs(snapshot);
    }
    if (viewText !== undefined) {
        process.stdout.write(viewText);
        return;
    }
    printThoughtSummary(thoughtId, options);
}
function handleThoughtHistory(thoughtId, options) {
    printThoughtHistory(thoughtId, options);
}
async function handleThoughtSearch(options) {
    const query = options.text ?? options.positionals.join(" ");
    if (!query) {
        throw new Error("thought search requires a query string.");
    }
    await printThoughtSearch(query, options, options.limit ?? 5, options.includeReflections);
}
function handleThoughtList(options) {
    printThoughtList(options);
}
async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.command === "config" && options.subcommand === "show") {
        printResolvedConfig(options);
        return;
    }
    if (options.command === "dsl") {
        await handleDslCommand(options);
        return;
    }
    if (options.command === "thought") {
        await handleThoughtCommand(options);
        return;
    }
    printUsage();
    process.exit(1);
}
await main();
//# sourceMappingURL=cli.js.map