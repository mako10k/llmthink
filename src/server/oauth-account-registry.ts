import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { isAbsolute } from "node:path";

import {
  assertHostedId,
  LLMTHINK_SERVER_SCOPES,
  type LlmthinkServerScope,
} from "./contracts.js";
import type {
  LlmthinkExternalOAuthIdentity,
  LlmthinkOAuthAccountResolver,
} from "./oauth-jwt.js";
import type { VerifiedBearerIdentity } from "./security.js";

export const OAUTH_ACCOUNT_REGISTRY_VERSION = 1;
export const OAUTH_ACCOUNT_REGISTRY_MAX_BYTES = 1024 * 1024;

interface OAuthAccountRecord {
  readonly issuer: string;
  readonly external_subject_id: string;
  readonly organization_id?: string;
  readonly subject_id: string;
  readonly tenant_id: string;
  readonly workspace_id: string;
  readonly scopes: readonly LlmthinkServerScope[];
  readonly status: "active" | "disabled";
  readonly mapping_revision: number;
}

interface OAuthAccountRegistryDocument {
  readonly version: 1;
  readonly accounts: readonly OAuthAccountRecord[];
}

const KNOWN_SCOPES = new Set<string>(LLMTHINK_SERVER_SCOPES);

function exactObject(
  value: unknown,
  fields: readonly string[],
  context: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }
  const allowed = new Set(fields);
  if (Object.keys(value).some((field) => !allowed.has(field))) {
    throw new Error(`${context} contains an unsupported field`);
  }
}

function boundedIdentity(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,256}$/.test(value)) {
    throw new Error(`${field} is invalid`);
  }
  return value;
}

function exactIssuer(value: unknown): string {
  if (typeof value !== "string") throw new Error("issuer is invalid");
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("issuer must be an exact HTTPS URL");
  }
  return value;
}

function hostedId(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`${field} is invalid`);
  assertHostedId(field, value);
  return value;
}

function parseRecord(value: unknown, index: number): OAuthAccountRecord {
  const context = `OAuth account registry entry ${index}`;
  exactObject(
    value,
    [
      "issuer",
      "external_subject_id",
      "organization_id",
      "subject_id",
      "tenant_id",
      "workspace_id",
      "scopes",
      "status",
      "mapping_revision",
    ],
    context,
  );
  const scopes = value.scopes;
  if (
    !Array.isArray(scopes) ||
    scopes.length === 0 ||
    new Set(scopes).size !== scopes.length ||
    scopes.some(
      (scope) => typeof scope !== "string" || !KNOWN_SCOPES.has(scope),
    )
  ) {
    throw new Error(`${context} scopes are invalid`);
  }
  const subjectId = hostedId(value.subject_id, `${context} subject_id`);
  const tenantId = hostedId(value.tenant_id, `${context} tenant_id`);
  const workspaceId = hostedId(value.workspace_id, `${context} workspace_id`);
  if (value.status !== "active" && value.status !== "disabled") {
    throw new Error(`${context} status is invalid`);
  }
  if (
    !Number.isSafeInteger(value.mapping_revision) ||
    Number(value.mapping_revision) < 1
  ) {
    throw new Error(`${context} mapping_revision is invalid`);
  }
  return Object.freeze({
    issuer: exactIssuer(value.issuer),
    external_subject_id: boundedIdentity(
      value.external_subject_id,
      `${context} external_subject_id`,
    ),
    ...(value.organization_id === undefined
      ? {}
      : {
          organization_id: boundedIdentity(
            value.organization_id,
            `${context} organization_id`,
          ),
        }),
    subject_id: subjectId,
    tenant_id: tenantId,
    workspace_id: workspaceId,
    scopes: Object.freeze([...scopes]) as readonly LlmthinkServerScope[],
    status: value.status,
    mapping_revision: Number(value.mapping_revision),
  });
}

function registryKey(
  issuer: string,
  subjectId: string,
  organizationId: string | undefined,
): string {
  return JSON.stringify([issuer, subjectId, organizationId ?? null]);
}

function parseRegistry(value: unknown): OAuthAccountRegistryDocument {
  exactObject(value, ["version", "accounts"], "OAuth account registry");
  if (value.version !== OAUTH_ACCOUNT_REGISTRY_VERSION) {
    throw new Error("OAuth account registry version is unsupported");
  }
  if (!Array.isArray(value.accounts) || value.accounts.length > 10_000) {
    throw new Error("OAuth account registry accounts are invalid or unbounded");
  }
  const accounts = value.accounts.map(parseRecord);
  const keys = accounts.map((account) =>
    registryKey(
      account.issuer,
      account.external_subject_id,
      account.organization_id,
    ),
  );
  if (new Set(keys).size !== keys.length) {
    throw new Error("OAuth account registry contains a duplicate identity");
  }
  return Object.freeze({ version: 1, accounts: Object.freeze(accounts) });
}

export async function loadOAuthAccountRegistry(
  path: string,
): Promise<LlmthinkOAuthAccountResolver> {
  if (!isAbsolute(path)) {
    throw new Error("OAuth account registry path must be absolute");
  }
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > OAUTH_ACCOUNT_REGISTRY_MAX_BYTES) {
      throw new Error("OAuth account registry must be a bounded regular file");
    }
    if ((stat.mode & 0o077) !== 0) {
      throw new Error("OAuth account registry must be owner-only (0600)");
    }
    const document = parseRegistry(JSON.parse(await handle.readFile("utf8")));
    const accounts = new Map(
      document.accounts.map((account) => [
        registryKey(
          account.issuer,
          account.external_subject_id,
          account.organization_id,
        ),
        account,
      ]),
    );
    return async (
      identity: LlmthinkExternalOAuthIdentity,
    ): Promise<VerifiedBearerIdentity> => {
      const account = accounts.get(
        registryKey(
          identity.issuer,
          identity.subjectId,
          identity.organizationId,
        ),
      );
      if (!account || account.status !== "active") {
        throw new Error("OAuth account mapping is unavailable");
      }
      return {
        subjectId: account.subject_id,
        tenantId: account.tenant_id,
        workspaceId: account.workspace_id,
        scopes: account.scopes,
      };
    };
  } finally {
    await handle.close();
  }
}
