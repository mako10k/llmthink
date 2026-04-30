import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { auditFile, auditText } from "./analyzer/audit.js";
import { getDslSyntaxGuidanceText } from "./dsl/guidance.js";
import { formatAuditReportText } from "./presentation/report.js";
import { formatThoughtHistory, formatThoughtList, formatThoughtSearchResults, formatThoughtSummary } from "./presentation/thought.js";
import {
	finalizeThought,
	listThoughts,
	loadThought,
	persistAuditReport,
	saveThoughtDraft,
	searchThoughts,
} from "./thought/store.js";

interface CliOptions {
	command?: string;
	subcommand?: string;
	text?: string;
	documentId?: string;
	thoughtId?: string;
	fromThoughtId?: string;
	helpTopic?: string;
	limit?: number;
	view?: string;
	positionals: string[];
	pretty: boolean;
}

function parseArgs(argv: string[]): CliOptions {
	const args = [...argv];
	let command = args.shift();
	if (command && command !== "audit" && command !== "thought") {
		args.unshift(command);
		command = "audit";
	}
	const subcommand = command === "thought" ? args.shift() : undefined;

	const options: CliOptions = { command, subcommand, pretty: false, positionals: [] };
	while (args.length > 0) {
		const arg = args.shift();
		if (!arg) break;
		if (arg === "--pretty") {
			options.pretty = true;
			continue;
		}
		if (arg === "--text") {
			options.text = args.shift() ?? "";
			continue;
		}
		if (arg === "--id") {
			const value = args.shift() ?? "document";
			options.documentId = value;
			options.thoughtId = value;
			continue;
		}
		if (arg === "--from") {
			options.fromThoughtId = args.shift();
			continue;
		}
		if (arg === "--limit") {
			const rawValue = args.shift();
			const parsed = Number(rawValue);
			options.limit = Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
			continue;
		}
		if (arg === "--help") {
			options.helpTopic = args[0]?.startsWith("--") ? "general" : (args.shift() ?? "general");
			continue;
		}
		options.positionals.push(arg);
	}
	if (command !== "thought" && !subcommand && options.positionals.length > 0) {
		options.documentId ??= undefined;
	}
	if (command === "thought" && subcommand === "show" && options.positionals.length > 0) {
		options.view = options.positionals[0];
	}
	return options;
}

function printUsage(): void {
	process.stdout.write(
		[
			"Usage:",
			"  llmthink audit <file> [--pretty]",
			"  llmthink audit --text \"...dsl...\" [--id document-id] [--pretty]",
			"  llmthink audit --help dsl",
			"  llmthink thought draft --id <thought-id> [<file> | --text \"...dsl...\"] [--from source-thought-id]",
			"  llmthink thought audit --id <thought-id> [<file> | --text \"...dsl...\"] [--pretty]",
			"  llmthink thought finalize --id <thought-id> [<file> | --text \"...dsl...\"]",
			"  llmthink thought show --id <thought-id> [summary|draft|final|audit]",
			"  llmthink thought history --id <thought-id>",
			"  llmthink thought search <query> [--limit 5]",
			"  llmthink thought list",
		].join("\n") + "\n",
	);
}

function printThoughtSummary(id: string): void {
	const snapshot = loadThought(id);
	process.stdout.write(formatThoughtSummary(snapshot));
}

function printThoughtHistory(id: string): void {
	const snapshot = loadThought(id);
	process.stdout.write(formatThoughtHistory(snapshot.history));
}

async function printThoughtSearch(query: string, limit = 5): Promise<void> {
	const results = (await searchThoughts(query)).slice(0, limit);
	process.stdout.write(formatThoughtSearchResults(results));
}

function printThoughtList(): void {
	const thoughts = listThoughts();
	process.stdout.write(formatThoughtList(thoughts));
}

function readTextFromSource(options: CliOptions): string | undefined {
	if (options.text) {
		return options.text;
	}
	if (options.positionals.length > 0) {
		return readFileSync(resolve(process.cwd(), options.positionals[0] ?? ""), "utf8");
	}
	if (options.fromThoughtId) {
		const source = loadThought(options.fromThoughtId);
		return source.finalText ?? source.draftText;
	}
	return undefined;
}

function readCurrentThoughtDraft(id: string): string {
	const snapshot = loadThought(id);
	const text = snapshot.draftText ?? snapshot.finalText;
	if (!text) {
		throw new Error(`Thought ${id} does not have a draft or final text yet.`);
	}
	return text;
}

async function handleAuditCommand(options: CliOptions): Promise<void> {
	const filePath = options.positionals[0];
	if (!filePath && !options.text) {
		printUsage();
		process.exit(1);
	}

	const report = options.text
		? await auditText(options.text, options.documentId ?? "stdin")
		: await auditFile(resolve(process.cwd(), filePath ?? "docs/examples/contradiction-pending.dsl"));

	if (options.pretty) {
		process.stdout.write(formatAuditReportText(report));
	} else {
		process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
	}
}

async function handleThoughtCommand(options: CliOptions): Promise<void> {
	const thoughtId = options.thoughtId;
	if (["draft", "audit", "finalize", "show", "history"].includes(options.subcommand ?? "") && !thoughtId) {
		throw new Error("--id <thought-id> is required for this thought command.");
	}

	if (options.subcommand === "draft") {
		const text = readTextFromSource(options);
		if (!text) {
			throw new Error("draft requires <file>, --text, or --from <thought-id>.");
		}
		saveThoughtDraft(thoughtId!, text);
		printThoughtSummary(thoughtId!);
		return;
	}

	if (options.subcommand === "audit") {
		const text = readTextFromSource(options) ?? readCurrentThoughtDraft(thoughtId!);
		if (options.text || options.positionals.length > 0 || options.fromThoughtId) {
			saveThoughtDraft(thoughtId!, text);
		}
		const report = await auditText(text, thoughtId!);
		persistAuditReport(thoughtId!, report);
		if (options.pretty) {
			process.stdout.write(formatAuditReportText(report));
		} else {
			process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
		}
		return;
	}

	if (options.subcommand === "finalize") {
		const text = readTextFromSource(options) ?? readCurrentThoughtDraft(thoughtId!);
		finalizeThought(thoughtId!, text);
		printThoughtSummary(thoughtId!);
		return;
	}

	if (options.subcommand === "show") {
		const snapshot = loadThought(thoughtId!);
		const view = options.view ?? "summary";
		if (view === "draft") {
			process.stdout.write(snapshot.draftText ?? "");
			return;
		}
		if (view === "final") {
			process.stdout.write(snapshot.finalText ?? "");
			return;
		}
		if (view === "audit") {
			process.stdout.write(snapshot.latestAudit ? formatAuditReportText(snapshot.latestAudit) : "No audit yet.\n");
			return;
		}
		printThoughtSummary(thoughtId!);
		return;
	}

	if (options.subcommand === "history") {
		printThoughtHistory(thoughtId!);
		return;
	}

	if (options.subcommand === "search") {
		const query = options.text ?? options.positionals.join(" ");
		if (!query) {
			throw new Error("thought search requires a query string.");
		}
		await printThoughtSearch(query, options.limit ?? 5);
		return;
	}

	if (options.subcommand === "list") {
		printThoughtList();
		return;
	}

	printUsage();
	process.exit(1);
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));

	if (options.helpTopic === "dsl") {
		process.stdout.write(getDslSyntaxGuidanceText());
		return;
	}

	if (!options.command || options.command === "audit") {
		await handleAuditCommand(options);
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