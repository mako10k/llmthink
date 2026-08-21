#!/usr/bin/env node

import { verifyResticSupply } from "./restic-supply.js";

function parseArguments(argv: readonly string[]): Record<string, string> {
  const allowed = new Set([
    "asset",
    "checksums",
    "signature",
    "keyring",
    "output-binary",
    "output-receipt",
    "verifier",
  ]);
  const values: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
    if (!option?.startsWith("--") || !value)
      throw new Error("invalid_arguments");
    const name = option.slice(2);
    if (!allowed.has(name) || values[name] !== undefined)
      throw new Error("invalid_arguments");
    values[name] = value;
  }
  if ([...allowed].some((name) => values[name] === undefined))
    throw new Error("invalid_arguments");
  return values;
}

try {
  const values = parseArguments(process.argv.slice(2));
  const receipt = await verifyResticSupply({
    assetPath: values.asset!,
    checksumsPath: values.checksums!,
    signaturePath: values.signature!,
    keyringPath: values.keyring!,
    outputBinaryPath: values["output-binary"]!,
    outputReceiptPath: values["output-receipt"]!,
    verifier: values.verifier!,
  });
  process.stdout.write(`${receipt.binary_sha256}\n`);
} catch (error) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "invalid_arguments";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
}
