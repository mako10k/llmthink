import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { auditDslFile } from "./analyzer/audit.js";
import { getDslExample } from "./dsl/examples.js";
import type { AuditReport } from "./model/diagnostics.js";

interface ExampleCase {
  inputId: string;
  expectedId: string;
}

const exampleCases: ExampleCase[] = [
  {
    inputId: "contradiction-pending",
    expectedId: "audit-output-sample",
  },
  {
    inputId: "query-assist",
    expectedId: "query-assist-audit",
  },
  {
    inputId: "query-unresolved",
    expectedId: "query-unresolved-audit",
  },
  {
    inputId: "framework-requires-and",
    expectedId: "framework-requires-and-audit",
  },
];

function normalize(report: AuditReport): AuditReport {
  return {
    ...report,
    generated_at: "<generated>",
  };
}

async function main(): Promise<void> {
  let failed = false;

  for (const exampleCase of exampleCases) {
    const input = getDslExample(exampleCase.inputId);
    const expectedOutput = getDslExample(exampleCase.expectedId);
    if (!input || !expectedOutput) {
      process.stderr.write(`Missing example registry entry: ${exampleCase.inputId} / ${exampleCase.expectedId}\n`);
      failed = true;
      continue;
    }
    const actual = normalize(
      await auditDslFile(resolve(process.cwd(), input.path), {
        embeddings: { provider: "none" },
      }),
    );
    const expected = JSON.parse(
      readFileSync(resolve(process.cwd(), expectedOutput.path), "utf8"),
    ) as AuditReport;
    const actualJson = JSON.stringify(actual, null, 2);
    const expectedJson = JSON.stringify(expected, null, 2);
    if (actualJson !== expectedJson) {
      failed = true;
      process.stderr.write(`Mismatch: ${input.path}\n`);
      process.stderr.write(`Expected: ${expectedOutput.path}\n`);
    } else {
      process.stdout.write(`OK: ${input.path}\n`);
    }
  }

  if (failed) {
    process.exitCode = 1;
  }
}

await main();
