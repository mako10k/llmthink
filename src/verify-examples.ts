import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { auditDslFile } from "./analyzer/audit.js";
import type { AuditReport } from "./model/diagnostics.js";

interface ExampleCase {
  input: string;
  expected: string;
}

const exampleCases: ExampleCase[] = [
  {
    input: "docs/examples/contradiction-pending.dsl",
    expected: "docs/examples/audit-output-sample.json",
  },
  {
    input: "docs/examples/query-assist.dsl",
    expected: "docs/examples/query-assist.audit.json",
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
    const actual = normalize(
      await auditDslFile(resolve(process.cwd(), exampleCase.input), {
        embeddings: { provider: "none" },
      }),
    );
    const expected = JSON.parse(
      readFileSync(resolve(process.cwd(), exampleCase.expected), "utf8"),
    ) as AuditReport;
    const actualJson = JSON.stringify(actual, null, 2);
    const expectedJson = JSON.stringify(expected, null, 2);
    if (actualJson !== expectedJson) {
      failed = true;
      process.stderr.write(`Mismatch: ${exampleCase.input}\n`);
      process.stderr.write(`Expected: ${exampleCase.expected}\n`);
    } else {
      process.stdout.write(`OK: ${exampleCase.input}\n`);
    }
  }

  if (failed) {
    process.exitCode = 1;
  }
}

await main();
