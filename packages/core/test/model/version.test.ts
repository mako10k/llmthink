import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  LLMTHINK_AUDIT_ENGINE_VERSION,
  LLMTHINK_GRAMMAR_VERSION,
  LLMTHINK_PACKAGE_VERSION,
} from "../../src/index.ts";

test("audit provenance versions match the current Core package and v1 grammar", async () => {
  const coreRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
  const manifest = JSON.parse(
    await readFile(join(coreRoot, "package.json"), "utf8"),
  ) as { version: string };

  assert.equal(LLMTHINK_PACKAGE_VERSION, manifest.version);
  assert.equal(LLMTHINK_GRAMMAR_VERSION, "1");
  assert.equal(LLMTHINK_AUDIT_ENGINE_VERSION, "0.1.0");
});
