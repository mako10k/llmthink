import { resolve } from "node:path";

import { auditFile } from "./analyzer/audit.js";

const inputPath = process.argv[2] ?? "docs/examples/contradiction-pending.dsl";
const resolvedPath = resolve(process.cwd(), inputPath);
const report = auditFile(resolvedPath);

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);