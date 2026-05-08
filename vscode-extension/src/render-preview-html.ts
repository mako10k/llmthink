#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import { type PreviewLocale } from "./i18n";
import { renderDslPreview } from "./preview";

interface CliArgs {
  inputPath?: string;
  outPath?: string;
  title?: string;
  locale: PreviewLocale;
}

function printUsage(): void {
  process.stdout.write(
    [
      "Usage:",
      "  npm run preview:html -- <file.dsl> [--out preview.html] [--title name] [--locale ja|en]",
    ].join("\n") + "\n",
  );
}

function parseArgs(argv: string[]): CliArgs {
  const args = [...argv];
  const options: CliArgs = {
    locale: "ja",
  };

  while (args.length > 0) {
    const arg = args.shift();
    if (!arg) {
      break;
    }
    if (arg === "--out") {
      options.outPath = args.shift();
      continue;
    }
    if (arg === "--title") {
      options.title = args.shift();
      continue;
    }
    if (arg === "--locale") {
      const locale = args.shift();
      if (locale === "ja" || locale === "en") {
        options.locale = locale;
      }
      continue;
    }
    if (!options.inputPath) {
      options.inputPath = arg;
    }
  }

  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!options.inputPath) {
    printUsage();
    process.exit(1);
  }

  const inputPath = resolve(process.cwd(), options.inputPath);
  const text = readFileSync(inputPath, "utf8");
  const title =
    options.title ?? (basename(options.inputPath).replace(/\.dsl$/i, "") || "preview");
  const html = await renderDslPreview(text, title, options.locale);

  if (options.outPath) {
    writeFileSync(resolve(process.cwd(), options.outPath), html, "utf8");
    return;
  }

  process.stdout.write(html);
}

void main();
