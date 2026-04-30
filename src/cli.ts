import { resolve } from "node:path";

import { auditFile, auditText } from "./analyzer/audit.js";
import { formatAuditReportText } from "./presentation/report.js";

interface CliOptions {
	filePath?: string;
	text?: string;
	documentId?: string;
	pretty: boolean;
}

function parseArgs(argv: string[]): CliOptions {
	const args = [...argv];
	if (args[0] === "audit") {
		args.shift();
	}

	const options: CliOptions = { pretty: false };
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
			options.documentId = args.shift() ?? "document";
			continue;
		}
		if (!options.filePath) {
			options.filePath = arg;
			continue;
		}
	}
	return options;
}

function printUsage(): void {
	process.stdout.write(
		[
			"Usage:",
			"  llmthink audit <file> [--pretty]",
			"  llmthink audit --text \"...dsl...\" [--id document-id] [--pretty]",
		].join("\n") + "\n",
	);
}

const options = parseArgs(process.argv.slice(2));

if (!options.filePath && !options.text) {
	printUsage();
	process.exit(1);
}

const report = options.text
	? auditText(options.text, options.documentId ?? "stdin")
	: auditFile(resolve(process.cwd(), options.filePath ?? "docs/examples/contradiction-pending.dsl"));

if (options.pretty) {
	process.stdout.write(formatAuditReportText(report));
} else {
	process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}