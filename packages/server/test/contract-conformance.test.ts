import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  assertSurfaceConformance,
  sha256,
  validateSurfaceContract,
} from "@llmthink/contracts";

import { hostedMcpProducerDescriptor } from "../src/index.js";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const canonicalPath = join(
  packageRoot,
  "..",
  "contracts",
  "contracts",
  "hosted-mcp-v1.json",
);

test("implementation-owned producer surface conforms to canonical Hosted MCP v1", async () => {
  const canonicalBytes = await readFile(canonicalPath);
  assert.equal(
    sha256(canonicalBytes),
    "774fb22a3ce4d6225cef7c791dc006414cf2795c54de308d08db17ed0245343d",
  );
  const canonical = validateSurfaceContract(
    JSON.parse(canonicalBytes.toString("utf8")),
  );
  const producer = hostedMcpProducerDescriptor({
    repository: "https://github.com/mako10k/llmthink",
    revision: "c205a7d8ff371f5ce36f4fe558f20f8b7d7b2aa9",
  });
  assertSurfaceConformance(canonical, producer);
  assert.deepEqual(producer.surfaces, canonical.surfaces);
});
