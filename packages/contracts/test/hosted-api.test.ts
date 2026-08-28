import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  LLMTHINK_SERVER_API_VERSION,
  LLMTHINK_SERVER_ERROR_CODES,
  LLMTHINK_SERVER_SCOPES,
  type DeleteThoughtCommand,
} from "../src/index.js";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("shared Hosted API literals match the canonical v1 schema", async () => {
  const schemas = JSON.parse(
    await readFile(
      join(packageRoot, "contracts", "hosted-mcp-v1.schemas.json"),
      "utf8",
    ),
  ) as {
    readonly contract_version: string;
    readonly scopes: readonly string[];
    readonly error_codes: readonly string[];
  };

  assert.equal(LLMTHINK_SERVER_API_VERSION, `v${schemas.contract_version}`);
  assert.deepEqual(LLMTHINK_SERVER_SCOPES, schemas.scopes);
  assert.deepEqual(LLMTHINK_SERVER_ERROR_CODES, schemas.error_codes);
});

test("shared Hosted API command types retain revision and identity fields", () => {
  const command = {
    ref: { tenantId: "tenant", workspaceId: "workspace", thoughtId: "thought" },
    expectedRevision: 3,
    identity: {
      idempotencyKey: "delete-3",
      requestDigest: `sha256:${"a".repeat(64)}`,
    },
  } satisfies DeleteThoughtCommand;

  assert.equal(command.expectedRevision, 3);
  assert.equal(command.identity.idempotencyKey, "delete-3");
});
