import { constants } from "node:fs";
import { lstat, open, readdir } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  assertHostedId,
  LLMTHINK_SERVER_FILE_SCHEMA_VERSION,
} from "../contracts.js";
import { SQLITE_LIFECYCLE_SCHEMA_VERSION } from "../sqlite-lifecycle-store.js";
import { parseBackupGenerationManifest } from "./contracts.js";
import { digestBackupFile, digestBackupTree } from "./generation.js";

const MAX_JSON_BYTES = 64 * 1024;

export interface RestoreValidationOptions {
  readonly generationPath: string;
  readonly expectedGenerationId: string;
  readonly expectedSnapshotId: string;
  readonly now?: () => Date;
}

export interface RestoreValidationReport {
  readonly format: "llmthink-restore-validation-v1";
  readonly generation_id: string;
  readonly snapshot_id: string;
  readonly validated_at: string;
  readonly lifecycle_schema_version: number;
  readonly catalog_pairs: number;
  readonly thought_pairs: number;
  readonly thoughts: number;
  readonly result: "valid";
  readonly activation_authorized: false;
}

export class RestoreValidationError extends Error {
  readonly code:
    | "unsafe_restore"
    | "manifest_mismatch"
    | "component_mismatch"
    | "sqlite_invalid"
    | "ownership_mismatch";

  constructor(code: RestoreValidationError["code"]) {
    super(code);
    this.name = "RestoreValidationError";
    this.code = code;
  }
}

async function readBoundedJson(path: string): Promise<unknown> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_JSON_BYTES)
      throw new RestoreValidationError("unsafe_restore");
    return JSON.parse(await handle.readFile("utf8")) as unknown;
  } catch (error) {
    if (error instanceof RestoreValidationError) throw error;
    throw new RestoreValidationError("unsafe_restore");
  } finally {
    await handle.close();
  }
}

async function directoryNames(path: string): Promise<readonly string[]> {
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch {
    throw new RestoreValidationError("unsafe_restore");
  }
  if (entries.some((entry) => !entry.isDirectory() || entry.isSymbolicLink())) {
    throw new RestoreValidationError("unsafe_restore");
  }
  return entries.map(({ name }) => name).sort();
}

function safeId(field: string, value: string): void {
  try {
    assertHostedId(field, value);
  } catch {
    throw new RestoreValidationError("unsafe_restore");
  }
}

async function inspectThoughtRecord(
  thoughtRoot: string,
  tenantId: string,
  workspaceId: string,
  thoughtId: string,
): Promise<void> {
  const pointer = await readBoundedJson(join(thoughtRoot, "CURRENT"));
  const pointerValue = pointer as Record<string, unknown>;
  if (
    !pointer ||
    typeof pointer !== "object" ||
    pointerValue.schema_version !== LLMTHINK_SERVER_FILE_SCHEMA_VERSION ||
    !Number.isSafeInteger(pointerValue.revision)
  ) {
    throw new RestoreValidationError("unsafe_restore");
  }
  const revision = pointerValue.revision as number;
  const record = await readBoundedJson(
    join(
      thoughtRoot,
      "revisions",
      revision.toString().padStart(16, "0"),
      "record.json",
    ),
  );
  const value = record as Record<string, unknown>;
  if (
    !record ||
    typeof record !== "object" ||
    value.schema_version !== LLMTHINK_SERVER_FILE_SCHEMA_VERSION ||
    value.tenant_id !== tenantId ||
    value.workspace_id !== workspaceId ||
    value.thought_id !== thoughtId ||
    value.revision !== revision
  ) {
    throw new RestoreValidationError("ownership_mismatch");
  }
}

async function inspectWorkspace(
  workspaceRoot: string,
  tenantId: string,
  workspaceId: string,
): Promise<number> {
  const entries = await directoryNames(workspaceRoot);
  if (entries.length !== 1 || entries[0] !== "thoughts")
    throw new RestoreValidationError("unsafe_restore");
  const thoughtIds = await directoryNames(join(workspaceRoot, "thoughts"));
  for (const thoughtId of thoughtIds) {
    safeId("thoughtId", thoughtId);
    await inspectThoughtRecord(
      join(workspaceRoot, "thoughts", thoughtId),
      tenantId,
      workspaceId,
      thoughtId,
    );
  }
  return thoughtIds.length;
}

async function inspectThoughts(
  root: string,
): Promise<{ pairs: Set<string>; thoughts: number }> {
  const rootEntries = await readdir(root, { withFileTypes: true });
  if (rootEntries.length === 0) return { pairs: new Set(), thoughts: 0 };
  if (
    rootEntries.length !== 1 ||
    rootEntries[0].name !== "tenants" ||
    !rootEntries[0].isDirectory()
  ) {
    throw new RestoreValidationError("unsafe_restore");
  }
  const pairs = new Set<string>();
  let thoughts = 0;
  for (const tenantId of await directoryNames(join(root, "tenants"))) {
    safeId("tenantId", tenantId);
    const tenantRoot = join(root, "tenants", tenantId);
    const entries = await directoryNames(tenantRoot);
    if (entries.length !== 1 || entries[0] !== "workspaces")
      throw new RestoreValidationError("unsafe_restore");
    for (const workspaceId of await directoryNames(
      join(tenantRoot, "workspaces"),
    )) {
      safeId("workspaceId", workspaceId);
      pairs.add(`${tenantId}\0${workspaceId}`);
      thoughts += await inspectWorkspace(
        join(tenantRoot, "workspaces", workspaceId),
        tenantId,
        workspaceId,
      );
    }
  }
  return { pairs, thoughts };
}

function inspectLifecycle(path: string): Set<string> {
  let database: DatabaseSync;
  try {
    database = new DatabaseSync(path, {
      allowExtension: false,
      readOnly: true,
    });
  } catch {
    throw new RestoreValidationError("sqlite_invalid");
  }
  try {
    const integrity = database.prepare("PRAGMA integrity_check").all();
    const foreignKeys = database.prepare("PRAGMA foreign_key_check").all();
    const schema = database
      .prepare("SELECT schema_version FROM schema_metadata WHERE singleton = 1")
      .get();
    if (
      integrity.length !== 1 ||
      integrity[0].integrity_check !== "ok" ||
      foreignKeys.length !== 0 ||
      schema?.schema_version !== SQLITE_LIFECYCLE_SCHEMA_VERSION
    )
      throw new RestoreValidationError("sqlite_invalid");
    const duplicates = database
      .prepare(
        "SELECT tenant_id FROM workspace_catalog GROUP BY tenant_id, workspace_id HAVING count(*) != 1",
      )
      .all();
    if (duplicates.length !== 0)
      throw new RestoreValidationError("ownership_mismatch");
    const rows = database
      .prepare(
        "SELECT tenant_id, workspace_id FROM workspace_catalog WHERE state IN ('provisioning', 'active', 'suspended', 'export_only', 'closed')",
      )
      .all();
    const pairs = new Set<string>();
    for (const row of rows) {
      if (
        typeof row.tenant_id !== "string" ||
        typeof row.workspace_id !== "string"
      )
        throw new RestoreValidationError("ownership_mismatch");
      const key = `${row.tenant_id}\0${row.workspace_id}`;
      if (pairs.has(key))
        throw new RestoreValidationError("ownership_mismatch");
      pairs.add(key);
    }
    return pairs;
  } finally {
    database.close();
  }
}

function requireComponentDigests(
  manifest: ReturnType<typeof parseBackupGenerationManifest>,
  lifecycle: { readonly digest: string; readonly size: number },
  thoughts: { readonly digest: string; readonly size: number },
): void {
  const lifecycleClaim = manifest.components.find(
    ({ kind }) => kind === "lifecycle_sqlite",
  );
  const thoughtClaim = manifest.components.find(
    ({ kind }) => kind === "thought_repository",
  );
  if (
    !lifecycleClaim ||
    lifecycleClaim.sha256 !== lifecycle.digest ||
    lifecycleClaim.byte_size !== lifecycle.size ||
    !thoughtClaim ||
    thoughtClaim.sha256 !== thoughts.digest ||
    thoughtClaim.byte_size !== thoughts.size
  ) {
    throw new RestoreValidationError("component_mismatch");
  }
}

export async function validateRestoredGeneration(
  options: RestoreValidationOptions,
): Promise<RestoreValidationReport> {
  const rootStat = await lstat(options.generationPath).catch(() => {
    throw new RestoreValidationError("unsafe_restore");
  });
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
    throw new RestoreValidationError("unsafe_restore");
  const entries = (await readdir(options.generationPath)).sort();
  if (
    entries.join("\0") !==
    ["lifecycle.sqlite", "manifest.json", "thought-data"].join("\0")
  )
    throw new RestoreValidationError("unsafe_restore");
  let manifest;
  try {
    manifest = parseBackupGenerationManifest(
      await readBoundedJson(join(options.generationPath, "manifest.json")),
    );
  } catch {
    throw new RestoreValidationError("manifest_mismatch");
  }
  if (manifest.generation_id !== options.expectedGenerationId)
    throw new RestoreValidationError("manifest_mismatch");
  const lifecycle = await digestBackupFile(
    join(options.generationPath, "lifecycle.sqlite"),
  );
  const thoughts = await digestBackupTree(
    join(options.generationPath, "thought-data"),
  );
  requireComponentDigests(manifest, lifecycle, thoughts);
  const catalogPairs = inspectLifecycle(
    join(options.generationPath, "lifecycle.sqlite"),
  );
  const thoughtState = await inspectThoughts(
    join(options.generationPath, "thought-data"),
  );
  for (const pair of thoughtState.pairs)
    if (!catalogPairs.has(pair))
      throw new RestoreValidationError("ownership_mismatch");
  return {
    format: "llmthink-restore-validation-v1",
    generation_id: manifest.generation_id,
    snapshot_id: options.expectedSnapshotId,
    validated_at: (options.now ?? (() => new Date()))().toISOString(),
    lifecycle_schema_version: SQLITE_LIFECYCLE_SCHEMA_VERSION,
    catalog_pairs: catalogPairs.size,
    thought_pairs: thoughtState.pairs.size,
    thoughts: thoughtState.thoughts,
    result: "valid",
    activation_authorized: false,
  };
}
