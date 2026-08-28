#!/usr/bin/env node

import { resolve } from "node:path";

import { verifyCandidateFiles, verifyContractPackage } from "./index.js";

function valueAfter(args: readonly string[], name: string): string {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  if (command === "verify-package") {
    const root = resolve(args[1] ?? process.cwd());
    console.log(JSON.stringify(await verifyContractPackage(root)));
    return;
  }
  if (command === "verify-candidate") {
    const contractPath = resolve(valueAfter(args, "--contract"));
    const candidatePath = resolve(valueAfter(args, "--candidate"));
    await verifyCandidateFiles({
      contractPath,
      candidatePath,
      exact: args.includes("--exact"),
    });
    console.log(
      JSON.stringify({
        contract: contractPath,
        candidate: candidatePath,
        exact: args.includes("--exact"),
        status: "conformant",
      }),
    );
    return;
  }
  throw new Error(
    "Usage: llmthink-contract verify-package [package-root] | verify-candidate --contract PATH --candidate PATH [--exact]",
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
