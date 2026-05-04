import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const target = resolve("build/llmthink-lsp.js");
const launcher = [
	"#!/usr/bin/env node",
	'import "../dist/lsp/server.js";',
	"",
].join("\n");

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, launcher, "utf8");
chmodSync(target, 0o755);