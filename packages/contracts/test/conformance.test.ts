import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  assertExactContractBytes,
  assertSurfaceConformance,
  validateSchemaSet,
  validateSurfaceContract,
  verifyCandidateFiles,
  verifyContractPackage,
} from "../src/index.js";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const contractPath = join(packageRoot, "contracts", "hosted-mcp-v1.json");

async function json(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

test("canonical package verifies hashes, schemas, and tool coverage", async () => {
  const report = await verifyContractPackage(packageRoot);
  assert.deepEqual(report, {
    package_name: "@llmthink/contracts",
    package_version: "1.0.0",
    contract_id: "llmthink-hosted-mcp",
    contract_version: "1",
    artifacts: [
      {
        role: "surface",
        path: "hosted-mcp-v1.json",
        sha256:
          "774fb22a3ce4d6225cef7c791dc006414cf2795c54de308d08db17ed0245343d",
      },
      {
        role: "schemas",
        path: "hosted-mcp-v1.schemas.json",
        sha256:
          "c33ecf8e1a65eca2556b32c42a15aa1ba2cdc700abe5f5f1fef8b8262ac4b40f",
      },
    ],
    tool_count: 11,
  });
});

test("tested producer and plugin consumer fixtures are exact contract copies", async () => {
  for (const candidatePath of [
    join(packageRoot, "fixtures", "producers", "llmthink-server-c205a7d.json"),
    join(
      packageRoot,
      "fixtures",
      "consumers",
      "llmthink-chatgpt-plugin-b480c84.json",
    ),
  ]) {
    await verifyCandidateFiles({ contractPath, candidatePath, exact: true });
  }
});

test("Conformance Kit rejects missing tools, changed effects, and changed required inputs", async () => {
  const expected = await json(contractPath);

  const missing = structuredClone(expected);
  const missingSurfaces = missing.surfaces as Record<string, unknown[]>;
  missingSurfaces.admitted = missingSurfaces.admitted.filter(
    (entry) => (entry as { name: string }).name !== "delete_thought",
  );
  assert.throws(
    () => assertSurfaceConformance(expected, missing),
    /admitted tool names do not match/,
  );

  const changedEffect = structuredClone(expected);
  const effectTools = (changedEffect.surfaces as Record<string, unknown[]>)
    .admitted as Record<string, unknown>[];
  effectTools.find((tool) => tool.name === "finalize_thought")!.effect =
    "external_write";
  assert.throws(
    () => assertSurfaceConformance(expected, changedEffect),
    /finalize_thought effect does not match/,
  );

  const changedRequired = structuredClone(expected);
  const requiredTools = (changedRequired.surfaces as Record<string, unknown[]>)
    .admitted as Record<string, unknown>[];
  requiredTools.find((tool) => tool.name === "create_thought_draft")!.required =
    ["thought_id"];
  assert.throws(
    () => assertSurfaceConformance(expected, changedRequired),
    /create_thought_draft required inputs do not match/,
  );
});

test("schema validation rejects unknown scopes", async () => {
  const surface = validateSurfaceContract(await json(contractPath));
  const schemaSet = await json(
    join(packageRoot, "contracts", "hosted-mcp-v1.schemas.json"),
  );
  const tools = schemaSet.tools as Record<string, Record<string, unknown>>;
  tools.delete_thought!.required_scopes = ["thought:admin"];
  assert.throws(
    () => validateSchemaSet(schemaSet, surface),
    /delete_thought uses unknown scope thought:admin/,
  );
});

test("schema validation rejects surface drift and undefined required properties", async () => {
  const surface = validateSurfaceContract(await json(contractPath));
  const schemaSet = await json(
    join(packageRoot, "contracts", "hosted-mcp-v1.schemas.json"),
  );
  const tools = schemaSet.tools as Record<string, Record<string, unknown>>;
  tools.begin_llmthink_onboarding!.surface = "admitted";
  assert.throws(
    () => validateSchemaSet(schemaSet, surface),
    /begin_llmthink_onboarding surface does not match/,
  );

  tools.begin_llmthink_onboarding!.surface = "onboarding";
  const input = tools.audit_thought!.input_schema as Record<string, unknown>;
  input.properties = {};
  assert.throws(
    () => validateSchemaSet(schemaSet, surface),
    /audit_thought requires undefined input property text/,
  );
});

test("schema records effective producer constraints and repository errors", async () => {
  const schemaSet = await json(
    join(packageRoot, "contracts", "hosted-mcp-v1.schemas.json"),
  );
  const definitions = schemaSet.$defs as Record<
    string,
    Record<string, unknown>
  >;
  assert.equal(definitions.idempotency_key!.pattern, "^[\\x21-\\x7e]{1,200}$");
  assert.equal(definitions.expected_revision!.maximum, Number.MAX_SAFE_INTEGER);

  const tools = schemaSet.tools as Record<string, Record<string, unknown>>;
  assert.ok(
    (tools.create_thought_draft!.error_codes as string[]).includes(
      "revision_conflict",
    ),
  );
  for (const name of [
    "create_thought_draft",
    "get_thought",
    "list_thoughts",
    "search_thoughts",
    "finalize_thought",
    "add_thought_reflection",
    "delete_thought",
    "get_thought_history",
  ]) {
    assert.ok(
      (tools[name]!.error_codes as string[]).includes(
        "unsupported_schema_version",
      ),
      `${name} must expose repository schema incompatibility`,
    );
  }
});

test("package verification rejects stale artifact hashes", async (t) => {
  const tempRoot = await mkdtemp(join(tmpdir(), "llmthink-contracts-"));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  await cp(packageRoot, tempRoot, { recursive: true });
  const schemaPath = join(tempRoot, "contracts", "hosted-mcp-v1.schemas.json");
  await writeFile(schemaPath, `${await readFile(schemaPath, "utf8")}\n`);
  await assert.rejects(
    verifyContractPackage(tempRoot),
    /stale artifact hash: hosted-mcp-v1.schemas.json/,
  );
});

test("package verification rejects duplicate artifact roles", async (t) => {
  const tempRoot = await mkdtemp(join(tmpdir(), "llmthink-contracts-"));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  await cp(packageRoot, tempRoot, { recursive: true });
  const manifestPath = join(tempRoot, "contracts", "manifest.json");
  const manifest = await json(manifestPath);
  const artifacts = manifest.artifacts as Record<string, unknown>[];
  artifacts[1]!.role = "surface";
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(
    verifyContractPackage(tempRoot),
    /duplicate artifact role: surface/,
  );
});

test("exact mode detects byte drift even when semantics are conformant", async () => {
  const expected = await readFile(contractPath);
  const compact = Buffer.from(
    JSON.stringify(JSON.parse(expected.toString("utf8"))),
  );
  assertSurfaceConformance(
    JSON.parse(expected.toString("utf8")),
    JSON.parse(compact.toString("utf8")),
  );
  assert.throws(
    () => assertExactContractBytes(expected, compact),
    /candidate bytes do not match/,
  );
});
