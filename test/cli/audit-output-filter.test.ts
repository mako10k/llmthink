import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

interface CliAuditOutput {
  report: {
    results: Array<{ category: string; severity: string }>;
    query_results: unknown[];
  };
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function runAudit(
  storagePath: string,
  ...outputArgs: string[]
): CliAuditOutput {
  const output = execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "src/cli.ts",
      "dsl",
      "audit",
      "docs/examples/query-assist.think",
      "--storage-path",
      storagePath,
      ...outputArgs,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );
  return JSON.parse(output) as CliAuditOutput;
}

test("dsl audit accepts minimum severity and category suppression options", () => {
  const storagePath = mkdtempSync(join(tmpdir(), "llmthink-cli-filter-"));
  try {
    const severityFiltered = runAudit(storagePath, "--min-severity", "warning");
    assert.deepEqual(severityFiltered.report.results, []);
    assert.deepEqual(severityFiltered.report.query_results, []);

    const categoryFiltered = runAudit(
      storagePath,
      "--suppress-tag",
      "semantic_hint,query_result",
    );
    assert.deepEqual(categoryFiltered.report.results, []);
    assert.deepEqual(categoryFiltered.report.query_results, []);
  } finally {
    rmSync(storagePath, { recursive: true, force: true });
  }
});
