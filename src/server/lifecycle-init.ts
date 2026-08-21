#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

import { LLMTHINK_SERVER_SCOPES } from "./contracts.js";
import { SqliteLifecycleStore } from "./sqlite-lifecycle-store.js";

interface ArtifactManifest {
  readonly id: string;
  readonly version: string;
  readonly locale: string;
  readonly effective_at: string;
  readonly content_path: string;
  readonly content_sha256: string;
  readonly summary_path?: string;
  readonly summary_sha256: string;
}

interface LifecycleManifest {
  readonly schema_version: 1;
  readonly terms: ArtifactManifest;
  readonly privacy_notice: ArtifactManifest;
  readonly scope_policy: {
    readonly id: string;
    readonly version: number;
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function exactDigest(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${field} must be a lowercase SHA-256 digest`);
  }
  return value;
}

function readArtifact(
  manifestDirectory: string,
  artifact: ArtifactManifest,
): { readonly content: string; readonly summary: string } {
  const content = readFileSync(
    resolve(manifestDirectory, artifact.content_path),
    "utf8",
  );
  const summary = artifact.summary_path
    ? readFileSync(resolve(manifestDirectory, artifact.summary_path), "utf8")
    : "";
  if (
    sha256(content) !==
      exactDigest(artifact.content_sha256, "content_sha256") ||
    sha256(summary) !== exactDigest(artifact.summary_sha256, "summary_sha256")
  ) {
    throw new Error(`Artifact digest mismatch for ${artifact.id}`);
  }
  return { content, summary };
}

export function initializeLifecycleDatabase(
  databasePath: string,
  manifestPath: string,
): Readonly<Record<string, unknown>> {
  if (!isAbsolute(databasePath) || !isAbsolute(manifestPath)) {
    throw new Error("Database and manifest paths must be absolute");
  }
  if (existsSync(databasePath)) {
    throw new Error("Lifecycle database already exists");
  }
  const manifest = JSON.parse(
    readFileSync(manifestPath, "utf8"),
  ) as LifecycleManifest;
  if (manifest.schema_version !== 1) {
    throw new Error("Lifecycle initialization manifest is unsupported");
  }
  const manifestDirectory = dirname(manifestPath);
  const terms = readArtifact(manifestDirectory, manifest.terms);
  const privacy = readArtifact(manifestDirectory, manifest.privacy_notice);
  let store: SqliteLifecycleStore | undefined;
  try {
    store = new SqliteLifecycleStore({ path: databasePath, createNew: true });
    store.createTermsArtifact({
      termsId: manifest.terms.id,
      kind: "trial_terms",
      version: manifest.terms.version,
      locale: manifest.terms.locale,
      effectiveAt: manifest.terms.effective_at,
      ...terms,
    });
    store.activateTerms(manifest.terms.id);
    store.createTermsArtifact({
      termsId: manifest.privacy_notice.id,
      kind: "privacy_notice",
      version: manifest.privacy_notice.version,
      locale: manifest.privacy_notice.locale,
      effectiveAt: manifest.privacy_notice.effective_at,
      ...privacy,
    });
    store.activateTerms(manifest.privacy_notice.id);
    store.createScopePolicy({
      scopePolicyId: manifest.scope_policy.id,
      version: manifest.scope_policy.version,
      scopes: LLMTHINK_SERVER_SCOPES,
    });
    const activeTerms = store.activeTermsArtifact(manifest.terms.id);
    const activePrivacy = store.activeTermsArtifact(
      manifest.privacy_notice.id,
      "privacy_notice",
    );
    return Object.freeze({
      database_path: databasePath,
      terms_id: activeTerms.termsId,
      terms_sha256: activeTerms.contentSha256,
      summary_sha256: activeTerms.summarySha256,
      privacy_notice_id: activePrivacy.termsId,
      privacy_notice_sha256: activePrivacy.contentSha256,
      scope_policy_id: manifest.scope_policy.id,
      counts: store.counts(),
    });
  } catch (error) {
    if (store) {
      store.close();
      store = undefined;
      for (const path of [
        databasePath,
        `${databasePath}-wal`,
        `${databasePath}-shm`,
      ]) {
        if (existsSync(path)) unlinkSync(path);
      }
    }
    throw error;
  } finally {
    store?.close();
  }
}

function argumentsFrom(argv: readonly string[]): {
  readonly databasePath: string;
  readonly manifestPath: string;
} {
  const databaseIndex = argv.indexOf("--database");
  const manifestIndex = argv.indexOf("--manifest");
  if (
    argv.length !== 4 ||
    databaseIndex < 0 ||
    manifestIndex < 0 ||
    !argv[databaseIndex + 1] ||
    !argv[manifestIndex + 1]
  ) {
    throw new Error(
      "Usage: llmthink-lifecycle-init --database /absolute/path --manifest /absolute/path",
    );
  }
  return {
    databasePath: argv[databaseIndex + 1]!,
    manifestPath: argv[manifestIndex + 1]!,
  };
}

if (process.argv[1]?.endsWith("lifecycle-init.js")) {
  const args = argumentsFrom(process.argv.slice(2));
  process.stdout.write(
    `${JSON.stringify(initializeLifecycleDatabase(args.databasePath, args.manifestPath))}\n`,
  );
}
