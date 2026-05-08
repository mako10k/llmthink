#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getDslSyntaxGuidanceText } from "./dsl/guidance.js";
import { formatAuditReportText } from "./presentation/report.js";
import {
  formatPersistedThoughtAudit,
  formatThoughtHistory,
  formatThoughtList,
  formatThoughtReflections,
  formatThoughtSearchResults,
  formatThoughtSummary,
} from "./presentation/thought.js";
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
} from "./thought/store.js";
import { auditAndPersistThought } from "./thought/workflow.js";

interface CliOptions {
  command?: string;
  subcommand?: string;
  text?: string;
  documentId?: string;
  thoughtId?: string;
  fromThoughtId?: string;
  kind?: string;
  includeReflections: boolean;
  limit?: number;
  view?: string;
  positionals: string[];
  pretty: boolean;
}

type CliOptionMutator = (options: CliOptions, remainingArgs: string[]) => void;

const OPTION_MUTATORS: Record<string, CliOptionMutator> = {
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
};

function isThoughtIdRequired(subcommand?: string): boolean {
  return [
    "draft",
    "relate",
    "audit",
    "finalize",
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
] satisfies ThoughtReflectionKind[];

function resolveReflectionKind(
  kind: string | undefined,
): ThoughtReflectionKind {
  if (!kind) {
    return "note";
  }
  if (REFLECTION_KINDS.includes(kind as ThoughtReflectionKind)) {
    return kind as ThoughtReflectionKind;
  }
  throw new Error(
    `Invalid --kind value: ${kind}. Use one of ${REFLECTION_KINDS.join(", ")}.`,
  );
}

function parseArgs(argv: string[]): CliOptions {
  const args = [...argv];
  const command = args.shift();
  const subcommand = args[0]?.startsWith("--") ? undefined : args.shift();

  const options: CliOptions = {
    command,
    subcommand,
    pretty: false,
    includeReflections: false,
    positionals: [],
  };
  while (args.length > 0) {
    const arg = args.shift();
    if (!arg) break;
    const mutator = OPTION_MUTATORS[arg];
    if (mutator) {
      mutator(options, args);
      continue;
    }
    options.positionals.push(arg);
  }
  if (
    command === "thought" &&
    subcommand === "show" &&
    options.positionals.length > 0
  ) {
    options.view = options.positionals[0];
  }
  return options;
}

function printUsage(): void {
  process.stdout.write(
    [
      "Usage:",
      "  llmthink dsl audit <file> [--pretty]",
      '  llmthink dsl audit --text "...dsl..." [--id document-id] [--pretty]',
      "  llmthink dsl help [topic] [subtopic] [index|quick|detail]",
      '  llmthink thought draft --id <thought-id> [<file> | --text "...dsl..."] [--from source-thought-id]',
      "  llmthink thought relate --id <thought-id> --from source-thought-id",
      '  llmthink thought audit --id <thought-id> [<file> | --text "...dsl..."] [--pretty]',
      '  llmthink thought finalize --id <thought-id> [<file> | --text "...dsl..."]',
      '  llmthink thought reflect --id <thought-id> --text "...comment..." [--kind note]',
      "  llmthink thought delete --id <thought-id>",
      "  llmthink thought show --id <thought-id> [summary|draft|final|audit|reflections]",
      "  llmthink thought history --id <thought-id>",
      "  llmthink thought search <query> [--limit 5] [--with-reflections]",
      "  llmthink thought list",
    ].join("\n") + "\n",
  );
}

function printThoughtSummary(id: string): void {
  process.stdout.write(formatThoughtSummary(loadThought(id)));
}

function printThoughtHistory(id: string): void {
  process.stdout.write(formatThoughtHistory(loadThought(id).history));
}

async function printThoughtSearch(
  query: string,
  limit = 5,
  includeReflections = false,
): Promise<void> {
  const results = (
    await searchThoughtRecords(query, undefined, { includeReflections })
  ).slice(0, limit);
  process.stdout.write(formatThoughtSearchResults(results));
}

function printThoughtList(): void {
  process.stdout.write(formatThoughtList(listThoughts()));
}

function readTextFromSource(options: CliOptions): string | undefined {
  if (options.text) {
    return options.text;
  }
  if (options.positionals.length > 0) {
    return readFileSync(
      resolve(process.cwd(), options.positionals[0] ?? ""),
      "utf8",
    );
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

async function handleDslCommand(options: CliOptions): Promise<void> {
  if (options.subcommand === "help") {
    const last = options.positionals.at(-1);
    const detail =
      last === "index" || last === "quick" || last === "detail"
        ? last
        : undefined;
    process.stdout.write(
      getDslSyntaxGuidanceText({
        topic: options.positionals[0],
        subtopic: options.positionals[1],
        detail,
        channel: "cli",
      }),
    );
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
  });

  if (options.pretty) {
    process.stdout.write(formatPersistedThoughtAudit(persisted));
    process.stdout.write(formatAuditReportText(persisted.report));
  } else {
    process.stdout.write(
      `${JSON.stringify(
        {
          thought_id: persisted.thoughtId,
          id_source: persisted.idSource,
          report: persisted.report,
        },
        null,
        2,
      )}\n`,
    );
  }
}

async function handleThoughtCommand(options: CliOptions): Promise<void> {
  const thoughtId = options.thoughtId;
  if (isThoughtIdRequired(options.subcommand) && !thoughtId) {
    throw new Error("--id <thought-id> is required for this thought command.");
  }

  switch (options.subcommand) {
    case "draft":
      return handleThoughtDraft(thoughtId!, options);
    case "relate":
      return handleThoughtRelate(thoughtId!, options);
    case "audit":
      return handleThoughtAudit(thoughtId!, options);
    case "finalize":
      return handleThoughtFinalize(thoughtId!, options);
    case "reflect":
      return handleThoughtReflect(thoughtId!, options);
    case "delete":
      return handleThoughtDelete(thoughtId!);
    case "show":
      return handleThoughtShow(thoughtId!, options);
    case "history":
      return handleThoughtHistory(thoughtId!);
    case "search":
      return handleThoughtSearch(options);
    case "list":
      return handleThoughtList();
    default:
      printUsage();
      process.exit(1);
  }
}

function handleThoughtDraft(thoughtId: string, options: CliOptions): void {
  const text = readTextFromSource(options);
  if (!text) {
    throw new Error("draft requires <file>, --text, or --from <thought-id>.");
  }
  draftThought(thoughtId, text);
  printThoughtSummary(thoughtId);
}

function handleThoughtRelate(thoughtId: string, options: CliOptions): void {
  if (!options.fromThoughtId) {
    throw new Error("relate requires --from <source-thought-id>.");
  }
  relateThought(thoughtId, options.fromThoughtId);
  printThoughtSummary(thoughtId);
}

async function handleThoughtAudit(
  thoughtId: string,
  options: CliOptions,
): Promise<void> {
  const text = readTextFromSource(options);
  const persisted = await auditAndPersistThought({
    dslText: text ?? readCurrentThoughtDraft(thoughtId),
    thoughtId,
  });
  if (options.pretty) {
    process.stdout.write(formatPersistedThoughtAudit(persisted));
    process.stdout.write(formatAuditReportText(persisted.report));
    return;
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        thought_id: persisted.thoughtId,
        id_source: persisted.idSource,
        report: persisted.report,
      },
      null,
      2,
    )}\n`,
  );
}

function handleThoughtFinalize(thoughtId: string, options: CliOptions): void {
  const text =
    readTextFromSource(options) ?? readCurrentThoughtDraft(thoughtId);
  finalizeThought(thoughtId, text);
  printThoughtSummary(thoughtId);
}

function handleThoughtReflect(thoughtId: string, options: CliOptions): void {
  const text = options.text ?? options.positionals.join(" ");
  if (!text) {
    throw new Error("reflect requires --text or trailing text.");
  }
  addThoughtReflection(thoughtId, text, resolveReflectionKind(options.kind));
  printThoughtSummary(thoughtId);
}

function handleThoughtDelete(thoughtId: string): void {
  if (!deleteThought(thoughtId)) {
    throw new Error(`Thought ${thoughtId} was not found.`);
  }
  process.stdout.write(`Deleted thought: ${thoughtId}\n`);
}

function handleThoughtShow(thoughtId: string, options: CliOptions): void {
  const snapshot = loadThought(thoughtId);
  const view = options.view ?? "summary";
  let viewText: string | undefined;
  if (view === "draft") {
    viewText = snapshot.draftText ?? "";
  } else if (view === "final") {
    viewText = snapshot.finalText ?? "";
  } else if (view === "audit") {
    viewText = snapshot.latestAudit
      ? formatAuditReportText(snapshot.latestAudit)
      : "No audit yet.\n";
  } else if (view === "reflections") {
    viewText = formatThoughtReflections(snapshot.reflections);
  }
  if (viewText !== undefined) {
    process.stdout.write(viewText);
    return;
  }
  printThoughtSummary(thoughtId);
}

function handleThoughtHistory(thoughtId: string): void {
  printThoughtHistory(thoughtId);
}

async function handleThoughtSearch(options: CliOptions): Promise<void> {
  const query = options.text ?? options.positionals.join(" ");
  if (!query) {
    throw new Error("thought search requires a query string.");
  }
  await printThoughtSearch(
    query,
    options.limit ?? 5,
    options.includeReflections,
  );
}

function handleThoughtList(): void {
  printThoughtList();
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

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
