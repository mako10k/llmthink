import { randomBytes, scryptSync, createHash } from "node:crypto";
import { chmodSync, closeSync, constants, existsSync, fchmodSync, lstatSync, openSync, unlinkSync, } from "node:fs";
import { isAbsolute } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { assertHostedId, LLMTHINK_SERVER_SCOPES, } from "./contracts.js";
const SCHEMA_VERSION = 1;
const ACTION_VERSION = "trial-agree-v1";
const RECOVERY_PREFIX = "llmthink-recovery-v1";
const KNOWN_SCOPES = new Set(LLMTHINK_SERVER_SCOPES);
const MIGRATION_0001 = `
CREATE TABLE schema_metadata (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
  migrated_at TEXT NOT NULL,
  migration_id TEXT NOT NULL,
  migration_sha256 BLOB NOT NULL CHECK (length(migration_sha256) = 32)
) STRICT;
CREATE TABLE terms_artifacts (
  terms_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('trial_terms', 'privacy_notice')),
  version TEXT NOT NULL,
  locale TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('draft', 'active', 'retired')),
  effective_at TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type = 'text/markdown; charset=utf-8'),
  content_bytes BLOB NOT NULL,
  content_sha256 BLOB NOT NULL CHECK (length(content_sha256) = 32),
  summary_bytes BLOB NOT NULL,
  summary_sha256 BLOB NOT NULL CHECK (length(summary_sha256) = 32),
  created_at TEXT NOT NULL,
  UNIQUE (kind, locale, version),
  UNIQUE (terms_id, content_sha256, summary_sha256)
) STRICT;
CREATE UNIQUE INDEX one_active_terms_per_kind_locale
  ON terms_artifacts(kind, locale) WHERE state = 'active';
CREATE TABLE accounts (
  account_id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('active', 'reconsent_required', 'suspended', 'export_only', 'closed')),
  accepted_terms_id TEXT NOT NULL REFERENCES terms_artifacts(terms_id),
  mapping_revision INTEGER NOT NULL CHECK (mapping_revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE external_identity_mappings (
  identity_mapping_id TEXT PRIMARY KEY,
  issuer TEXT NOT NULL,
  external_subject_id TEXT NOT NULL,
  organization_key TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  state TEXT NOT NULL CHECK (state IN ('active', 'replaced', 'revoked')),
  mapping_revision INTEGER NOT NULL CHECK (mapping_revision >= 1),
  created_at TEXT NOT NULL,
  replaced_at TEXT,
  UNIQUE (issuer, external_subject_id, organization_key, mapping_revision)
) STRICT;
CREATE UNIQUE INDEX one_active_mapping_per_external_identity
  ON external_identity_mappings(issuer, external_subject_id, organization_key) WHERE state = 'active';
CREATE UNIQUE INDEX one_active_external_identity_per_account
  ON external_identity_mappings(account_id) WHERE state = 'active';
CREATE TABLE agreement_receipts (
  receipt_id TEXT PRIMARY KEY,
  identity_mapping_id TEXT NOT NULL REFERENCES external_identity_mappings(identity_mapping_id),
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  terms_id TEXT NOT NULL,
  terms_version TEXT NOT NULL,
  content_sha256 BLOB NOT NULL CHECK (length(content_sha256) = 32),
  summary_sha256 BLOB NOT NULL CHECK (length(summary_sha256) = 32),
  action_version TEXT NOT NULL CHECK (action_version = 'trial-agree-v1'),
  accepted_at TEXT NOT NULL,
  provisioning_operation_id TEXT NOT NULL,
  FOREIGN KEY (terms_id, content_sha256, summary_sha256)
    REFERENCES terms_artifacts(terms_id, content_sha256, summary_sha256),
  UNIQUE (identity_mapping_id, terms_id, action_version),
  UNIQUE (provisioning_operation_id)
) STRICT;
CREATE TABLE tenant_catalog (
  tenant_id TEXT PRIMARY KEY,
  owner_account_id TEXT NOT NULL UNIQUE REFERENCES accounts(account_id),
  state TEXT NOT NULL CHECK (state IN ('provisioning', 'active', 'export_only', 'closed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE workspace_catalog (
  workspace_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenant_catalog(tenant_id),
  kind TEXT NOT NULL CHECK (kind IN ('initial', 'additional')),
  state TEXT NOT NULL CHECK (state IN ('provisioning', 'active', 'export_only', 'closed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (tenant_id, workspace_id)
) STRICT;
CREATE UNIQUE INDEX one_initial_workspace_per_tenant
  ON workspace_catalog(tenant_id) WHERE kind = 'initial';
CREATE TABLE scope_policies (
  scope_policy_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL CHECK (version >= 1),
  state TEXT NOT NULL CHECK (state IN ('draft', 'active', 'retired')),
  scopes_json TEXT NOT NULL CHECK (json_valid(scopes_json)),
  created_at TEXT NOT NULL,
  UNIQUE (scope_policy_id, version)
) STRICT;
CREATE TABLE account_scope_bindings (
  account_id TEXT PRIMARY KEY REFERENCES accounts(account_id),
  scope_policy_id TEXT NOT NULL REFERENCES scope_policies(scope_policy_id),
  bound_at TEXT NOT NULL,
  binding_revision INTEGER NOT NULL CHECK (binding_revision >= 1)
) STRICT;
CREATE TABLE recovery_credentials (
  recovery_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  verifier_version TEXT NOT NULL,
  verifier_bytes BLOB NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('active', 'rotated', 'revoked')),
  issued_at TEXT NOT NULL,
  rotated_at TEXT,
  last_used_at TEXT
) STRICT;
CREATE UNIQUE INDEX one_active_recovery_credential_per_account
  ON recovery_credentials(account_id) WHERE state = 'active';
CREATE TABLE provisioning_operations (
  provisioning_operation_id TEXT PRIMARY KEY,
  issuer TEXT NOT NULL,
  external_subject_id TEXT NOT NULL,
  organization_key TEXT NOT NULL,
  terms_id TEXT NOT NULL REFERENCES terms_artifacts(terms_id),
  action_version TEXT NOT NULL,
  account_id TEXT NOT NULL UNIQUE REFERENCES accounts(account_id),
  tenant_id TEXT NOT NULL UNIQUE REFERENCES tenant_catalog(tenant_id),
  initial_workspace_id TEXT NOT NULL UNIQUE REFERENCES workspace_catalog(workspace_id),
  receipt_id TEXT NOT NULL UNIQUE REFERENCES agreement_receipts(receipt_id),
  state TEXT NOT NULL CHECK (state = 'committed'),
  committed_at TEXT NOT NULL,
  UNIQUE (issuer, external_subject_id, organization_key)
) STRICT;
CREATE TABLE account_state_events (
  event_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  from_state TEXT,
  to_state TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('system', 'user', 'operator')),
  occurred_at TEXT NOT NULL,
  mapping_revision INTEGER NOT NULL CHECK (mapping_revision >= 1)
) STRICT;
CREATE TABLE realization_outbox (
  outbox_id TEXT PRIMARY KEY,
  operation_kind TEXT NOT NULL CHECK (operation_kind = 'realize_initial_workspace'),
  tenant_id TEXT NOT NULL REFERENCES tenant_catalog(tenant_id),
  workspace_id TEXT NOT NULL REFERENCES workspace_catalog(workspace_id),
  state TEXT NOT NULL CHECK (state IN ('pending', 'leased', 'done', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at TEXT NOT NULL,
  lease_owner TEXT,
  lease_expires_at TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (operation_kind, tenant_id, workspace_id)
) STRICT;
CREATE INDEX pending_realization_order ON realization_outbox(state, available_at, outbox_id);
`;
function exactHttpsIssuer(value) {
    const url = new URL(value);
    if (url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash) {
        throw new Error("OAuth issuer must be an exact HTTPS URL");
    }
    return value;
}
function boundedIdentity(value, field) {
    if (!/^[A-Za-z0-9._:-]{1,256}$/.test(value)) {
        throw new Error(`${field} is invalid`);
    }
    return value;
}
function hostedId(value, field) {
    assertHostedId(field, value);
    return value;
}
function canonicalScopes(scopes) {
    if (scopes.length === 0 ||
        new Set(scopes).size !== scopes.length ||
        scopes.some((scope) => !KNOWN_SCOPES.has(scope))) {
        throw new Error("Scope policy contains invalid scopes");
    }
    return JSON.stringify([...scopes].sort());
}
function parseScopes(value) {
    if (typeof value !== "string")
        throw new Error("Scope policy is unavailable");
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) ||
        parsed.length === 0 ||
        new Set(parsed).size !== parsed.length ||
        parsed.some((scope) => typeof scope !== "string" || !KNOWN_SCOPES.has(scope))) {
        throw new Error("Scope policy is unavailable");
    }
    return Object.freeze(parsed);
}
function sha256(value) {
    return createHash("sha256").update(value).digest();
}
function text(row, field) {
    const value = row[field];
    if (typeof value !== "string")
        throw new Error("Lifecycle record is unavailable");
    return value;
}
export class SqliteLifecycleStore {
    #db;
    #now;
    #entropy;
    constructor(options) {
        if (options.path !== ":memory:" && !isAbsolute(options.path)) {
            throw new Error("Lifecycle database path must be absolute");
        }
        if (options.path === ":memory:" && !options.allowMemory) {
            throw new Error("In-memory lifecycle database is test-only");
        }
        this.#now = options.now ?? (() => new Date());
        this.#entropy = options.entropy ?? randomBytes;
        if (options.path !== ":memory:")
            prepareDatabasePath(options.path);
        this.#db = new DatabaseSync(options.path, { allowExtension: false });
        try {
            this.#configure();
            this.#migrate();
        }
        catch (error) {
            this.#db.close();
            throw error;
        }
    }
    close() {
        this.#db.close();
    }
    async backupTo(path) {
        if (!isAbsolute(path) || existsSync(path)) {
            throw new Error("Lifecycle backup destination must be an absent absolute path");
        }
        try {
            await backup(this.#db, path);
            chmodSync(path, 0o600);
            const restored = new DatabaseSync(path, {
                allowExtension: false,
            });
            try {
                restored.exec("PRAGMA journal_mode = DELETE");
                const integrity = restored.prepare("PRAGMA integrity_check").all();
                const foreignKeys = restored.prepare("PRAGMA foreign_key_check").all();
                const schema = restored
                    .prepare("SELECT schema_version FROM schema_metadata WHERE singleton = 1")
                    .get();
                if (integrity.length !== 1 ||
                    text(integrity[0], "integrity_check") !== "ok" ||
                    foreignKeys.length !== 0 ||
                    !schema ||
                    schema.schema_version !== SCHEMA_VERSION) {
                    throw new Error("Lifecycle backup validation failed");
                }
            }
            finally {
                restored.close();
            }
        }
        catch (error) {
            if (existsSync(path))
                unlinkSync(path);
            throw error;
        }
    }
    createTermsArtifact(input) {
        hostedId(input.termsId, "termsId");
        const content = Buffer.from(input.content, "utf8");
        const summary = Buffer.from(input.summary, "utf8");
        this.#db
            .prepare(`INSERT INTO terms_artifacts (
        terms_id, kind, version, locale, state, effective_at, content_type,
        content_bytes, content_sha256, summary_bytes, summary_sha256, created_at
      ) VALUES (?, ?, ?, ?, 'draft', ?, 'text/markdown; charset=utf-8', ?, ?, ?, ?, ?)`)
            .run(input.termsId, input.kind, boundedIdentity(input.version, "terms version"), boundedIdentity(input.locale, "terms locale"), input.effectiveAt, content, sha256(content), summary, sha256(summary), this.#timestamp());
    }
    activateTerms(termsId) {
        hostedId(termsId, "termsId");
        this.#transaction(() => {
            const row = this.#db
                .prepare("SELECT kind, locale, state FROM terms_artifacts WHERE terms_id = ?")
                .get(termsId);
            if (!row || row.state !== "draft")
                throw new Error("Terms artifact is unavailable");
            this.#db
                .prepare("UPDATE terms_artifacts SET state = 'retired' WHERE kind = ? AND locale = ? AND state = 'active'")
                .run(row.kind, row.locale);
            this.#db
                .prepare("UPDATE terms_artifacts SET state = 'active' WHERE terms_id = ? AND state = 'draft'")
                .run(termsId);
            if (row.kind === "trial_terms") {
                const affected = this.#db
                    .prepare("SELECT account_id, mapping_revision FROM accounts WHERE state = 'active' AND accepted_terms_id <> ?")
                    .all(termsId);
                const timestamp = this.#timestamp();
                for (const account of affected) {
                    this.#db
                        .prepare("UPDATE accounts SET state = 'reconsent_required', updated_at = ? WHERE account_id = ? AND state = 'active'")
                        .run(timestamp, account.account_id);
                    this.#run("INSERT INTO account_state_events VALUES (?, ?, 'active', 'reconsent_required', 'material_terms_changed', 'system', ?, ?)", this.#id("event"), account.account_id, timestamp, account.mapping_revision);
                }
            }
        });
    }
    activeTermsArtifact(termsId, kind = "trial_terms") {
        hostedId(termsId, "termsId");
        const row = this.#db
            .prepare(`SELECT terms_id, version, locale, effective_at, content_bytes,
          summary_bytes, content_sha256, summary_sha256
        FROM terms_artifacts
        WHERE terms_id = ? AND kind = ? AND state = 'active'`)
            .get(termsId, kind);
        if (!row ||
            !(row.content_bytes instanceof Uint8Array) ||
            !(row.summary_bytes instanceof Uint8Array) ||
            !(row.content_sha256 instanceof Uint8Array) ||
            !(row.summary_sha256 instanceof Uint8Array)) {
            throw new Error("Terms artifact is unavailable");
        }
        return Object.freeze({
            termsId: text(row, "terms_id"),
            version: text(row, "version"),
            locale: text(row, "locale"),
            effectiveAt: text(row, "effective_at"),
            content: Buffer.from(row.content_bytes).toString("utf8"),
            summary: Buffer.from(row.summary_bytes).toString("utf8"),
            contentSha256: Buffer.from(row.content_sha256).toString("hex"),
            summarySha256: Buffer.from(row.summary_sha256).toString("hex"),
        });
    }
    onboardingAccountState(identityInput) {
        const identity = this.#identity(identityInput);
        const row = this.#db
            .prepare(`SELECT a.state
        FROM external_identity_mappings eim
        JOIN accounts a ON a.account_id = eim.account_id
        WHERE eim.issuer = ? AND eim.external_subject_id = ? AND eim.organization_key = ?
          AND eim.state = 'active'`)
            .get(identity.issuer, identity.subject, identity.organizationKey);
        if (!row)
            return "unregistered";
        const state = text(row, "state");
        if (state === "active" || state === "reconsent_required")
            return state;
        return "unavailable";
    }
    recordReconsent(identityInput, termsId, actionVersion) {
        if (actionVersion !== ACTION_VERSION) {
            throw new Error("Agreement action version is unsupported");
        }
        const identity = this.#identity(identityInput);
        hostedId(termsId, "termsId");
        const receiptId = this.#id("receipt");
        const agreementOperationId = this.#id("agree");
        const eventId = this.#id("event");
        const timestamp = this.#timestamp();
        return this.#transaction(() => {
            const row = this.#db
                .prepare(`SELECT eim.identity_mapping_id, a.account_id, a.mapping_revision,
            ta.version, ta.content_sha256, ta.summary_sha256
          FROM external_identity_mappings eim
          JOIN accounts a ON a.account_id = eim.account_id
          JOIN terms_artifacts ta ON ta.terms_id = ? AND ta.kind = 'trial_terms' AND ta.state = 'active'
          WHERE eim.issuer = ? AND eim.external_subject_id = ? AND eim.organization_key = ?
            AND eim.state = 'active' AND a.state = 'reconsent_required'`)
                .get(termsId, identity.issuer, identity.subject, identity.organizationKey);
            if (!row)
                throw new Error("Account re-consent is unavailable");
            this.#run("INSERT INTO agreement_receipts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", receiptId, row.identity_mapping_id, row.account_id, termsId, row.version, row.content_sha256, row.summary_sha256, ACTION_VERSION, timestamp, agreementOperationId);
            this.#db
                .prepare("UPDATE accounts SET state = 'active', accepted_terms_id = ?, updated_at = ? WHERE account_id = ? AND state = 'reconsent_required'")
                .run(termsId, timestamp, row.account_id);
            this.#run("INSERT INTO account_state_events VALUES (?, ?, 'reconsent_required', 'active', 'terms_reaccepted', 'user', ?, ?)", eventId, row.account_id, timestamp, row.mapping_revision);
            return receiptId;
        });
    }
    transitionAccount(identityInput, toState, reasonCode) {
        const identity = this.#identity(identityInput);
        boundedIdentity(reasonCode, "account transition reason");
        const eventId = this.#id("event");
        const timestamp = this.#timestamp();
        return this.#transaction(() => {
            const row = this.#db
                .prepare(`SELECT a.account_id, a.state, a.mapping_revision, tc.tenant_id
          FROM external_identity_mappings eim
          JOIN accounts a ON a.account_id = eim.account_id
          JOIN tenant_catalog tc ON tc.owner_account_id = a.account_id
          WHERE eim.issuer = ? AND eim.external_subject_id = ? AND eim.organization_key = ?
            AND eim.state = 'active'`)
                .get(identity.issuer, identity.subject, identity.organizationKey);
            if (!row || !allowedOperatorTransition(text(row, "state"), toState)) {
                throw new Error("Account transition is unavailable");
            }
            const fromState = text(row, "state");
            this.#db
                .prepare("UPDATE accounts SET state = ?, updated_at = ? WHERE account_id = ? AND state = ?")
                .run(toState, timestamp, row.account_id, fromState);
            if (toState === "export_only" || toState === "closed") {
                this.#db
                    .prepare("UPDATE tenant_catalog SET state = ?, updated_at = ? WHERE owner_account_id = ?")
                    .run(toState, timestamp, row.account_id);
                this.#db
                    .prepare("UPDATE workspace_catalog SET state = ?, updated_at = ? WHERE tenant_id = ?")
                    .run(toState, timestamp, row.tenant_id);
            }
            this.#run("INSERT INTO account_state_events VALUES (?, ?, ?, ?, ?, 'operator', ?, ?)", eventId, row.account_id, fromState, toState, reasonCode, timestamp, row.mapping_revision);
            return toState;
        });
    }
    createScopePolicy(input) {
        hostedId(input.scopePolicyId, "scopePolicyId");
        if (!Number.isSafeInteger(input.version) || input.version < 1) {
            throw new Error("Scope policy version is invalid");
        }
        this.#db
            .prepare(`INSERT INTO scope_policies
        (scope_policy_id, version, state, scopes_json, created_at)
        VALUES (?, ?, 'active', ?, ?)`)
            .run(input.scopePolicyId, input.version, canonicalScopes(input.scopes), this.#timestamp());
    }
    provisionTrialAccount(input) {
        if (input.actionVersion !== ACTION_VERSION) {
            throw new Error("Agreement action version is unsupported");
        }
        const identity = this.#identity(input.identity);
        hostedId(input.termsId, "termsId");
        hostedId(input.scopePolicyId, "scopePolicyId");
        const existing = this.#existing(identity);
        if (existing)
            return existing;
        const generated = {
            accountId: this.#id("acct"),
            subjectId: this.#id("subj"),
            tenantId: this.#id("tenant"),
            workspaceId: this.#id("ws"),
            mappingId: this.#id("mapping"),
            receiptId: this.#id("receipt"),
            operationId: this.#id("prov"),
            recoveryId: this.#id("recovery"),
            outboxId: this.#id("outbox"),
            eventId: this.#id("event"),
        };
        const recoverySecret = this.#entropy(32).toString("base64url");
        const recoverySalt = this.#entropy(16);
        const recoveryHash = scryptSync(recoverySecret, recoverySalt, 32);
        const recoveryVerifier = Buffer.concat([recoverySalt, recoveryHash]);
        const timestamp = this.#timestamp();
        try {
            this.#transaction(() => {
                const terms = this.#db
                    .prepare(`SELECT terms_id, version, content_sha256, summary_sha256
            FROM terms_artifacts WHERE terms_id = ? AND kind = 'trial_terms' AND state = 'active'`)
                    .get(input.termsId);
                if (!terms)
                    throw new Error("Terms artifact changed or is unavailable");
                const policy = this.#db
                    .prepare("SELECT scopes_json FROM scope_policies WHERE scope_policy_id = ? AND state = 'active'")
                    .get(input.scopePolicyId);
                if (!policy)
                    throw new Error("Scope policy is unavailable");
                parseScopes(policy.scopes_json);
                if (this.#existing(identity))
                    throw new ExistingProvisioningError();
                this.#run("INSERT INTO accounts VALUES (?, ?, 'active', ?, 1, ?, ?)", generated.accountId, generated.subjectId, input.termsId, timestamp, timestamp);
                this.#run("INSERT INTO external_identity_mappings VALUES (?, ?, ?, ?, ?, 'active', 1, ?, NULL)", generated.mappingId, identity.issuer, identity.subject, identity.organizationKey, generated.accountId, timestamp);
                this.#run("INSERT INTO agreement_receipts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", generated.receiptId, generated.mappingId, generated.accountId, input.termsId, text(terms, "version"), terms.content_sha256, terms.summary_sha256, ACTION_VERSION, timestamp, generated.operationId);
                this.#run("INSERT INTO tenant_catalog VALUES (?, ?, 'provisioning', ?, ?)", generated.tenantId, generated.accountId, timestamp, timestamp);
                this.#run("INSERT INTO workspace_catalog VALUES (?, ?, 'initial', 'provisioning', ?, ?)", generated.workspaceId, generated.tenantId, timestamp, timestamp);
                this.#run("INSERT INTO account_scope_bindings VALUES (?, ?, ?, 1)", generated.accountId, input.scopePolicyId, timestamp);
                this.#run("INSERT INTO recovery_credentials VALUES (?, ?, 'scrypt-v1', ?, 'active', ?, NULL, NULL)", generated.recoveryId, generated.accountId, recoveryVerifier, timestamp);
                this.#run("INSERT INTO provisioning_operations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'committed', ?)", generated.operationId, identity.issuer, identity.subject, identity.organizationKey, input.termsId, ACTION_VERSION, generated.accountId, generated.tenantId, generated.workspaceId, generated.receiptId, timestamp);
                this.#run("INSERT INTO account_state_events VALUES (?, ?, NULL, 'active', 'initial_provisioning', 'user', ?, 1)", generated.eventId, generated.accountId, timestamp);
                this.#run("INSERT INTO realization_outbox VALUES (?, 'realize_initial_workspace', ?, ?, 'pending', 0, ?, NULL, NULL, NULL, ?, NULL)", generated.outboxId, generated.tenantId, generated.workspaceId, timestamp, timestamp);
            });
        }
        catch (error) {
            if (error instanceof ExistingProvisioningError ||
                isUniqueConstraint(error)) {
                const winner = this.#existing(identity);
                if (winner)
                    return winner;
            }
            throw error;
        }
        return Object.freeze({
            status: "provisioned",
            subjectId: generated.subjectId,
            tenantId: generated.tenantId,
            workspaceId: generated.workspaceId,
            receiptId: generated.receiptId,
            provisioningOperationId: generated.operationId,
            recoveryCredential: `${RECOVERY_PREFIX}.${recoverySecret}`,
        });
    }
    markInitialWorkspaceRealized(tenantId, workspaceId) {
        hostedId(tenantId, "tenantId");
        hostedId(workspaceId, "workspaceId");
        const timestamp = this.#timestamp();
        this.#transaction(() => {
            const outbox = this.#db
                .prepare(`SELECT outbox_id FROM realization_outbox
          WHERE tenant_id = ? AND workspace_id = ? AND state IN ('pending', 'leased')`)
                .get(tenantId, workspaceId);
            if (!outbox)
                throw new Error("Workspace realization is unavailable");
            this.#db
                .prepare("UPDATE tenant_catalog SET state = 'active', updated_at = ? WHERE tenant_id = ? AND state = 'provisioning'")
                .run(timestamp, tenantId);
            this.#db
                .prepare("UPDATE workspace_catalog SET state = 'active', updated_at = ? WHERE workspace_id = ? AND tenant_id = ? AND state = 'provisioning'")
                .run(timestamp, workspaceId, tenantId);
            this.#db
                .prepare("UPDATE realization_outbox SET state = 'done', completed_at = ? WHERE outbox_id = ?")
                .run(timestamp, outbox.outbox_id);
        });
    }
    accountResolver() {
        return async (identity) => {
            const key = this.#identity(identity);
            this.#db.exec("BEGIN");
            try {
                const row = this.#db
                    .prepare(`SELECT a.subject_id, tc.tenant_id, wc.workspace_id, sp.scopes_json
            FROM external_identity_mappings eim
            JOIN accounts a ON a.account_id = eim.account_id
            JOIN tenant_catalog tc ON tc.owner_account_id = a.account_id
            JOIN workspace_catalog wc ON wc.tenant_id = tc.tenant_id AND wc.kind = 'initial'
            JOIN account_scope_bindings asb ON asb.account_id = a.account_id
            JOIN scope_policies sp ON sp.scope_policy_id = asb.scope_policy_id
            WHERE eim.issuer = ? AND eim.external_subject_id = ? AND eim.organization_key = ?
              AND eim.state = 'active' AND a.state = 'active'
              AND tc.state = 'active' AND wc.state = 'active' AND sp.state = 'active'`)
                    .get(key.issuer, key.subject, key.organizationKey);
                if (!row)
                    throw new Error("OAuth account mapping is unavailable");
                const result = Object.freeze({
                    subjectId: hostedId(text(row, "subject_id"), "subjectId"),
                    tenantId: hostedId(text(row, "tenant_id"), "tenantId"),
                    workspaceId: hostedId(text(row, "workspace_id"), "workspaceId"),
                    scopes: parseScopes(row.scopes_json),
                });
                this.#db.exec("COMMIT");
                return result;
            }
            catch (error) {
                this.#db.exec("ROLLBACK");
                throw error;
            }
        };
    }
    counts() {
        const tables = [
            "accounts",
            "external_identity_mappings",
            "agreement_receipts",
            "tenant_catalog",
            "workspace_catalog",
            "recovery_credentials",
            "provisioning_operations",
            "realization_outbox",
        ];
        return Object.freeze(Object.fromEntries(tables.map((table) => {
            const row = this.#db
                .prepare(`SELECT count(*) AS count FROM ${table}`)
                .get();
            return [table, Number(row.count)];
        })));
    }
    #configure() {
        this.#db.exec("PRAGMA foreign_keys = ON");
        this.#db.exec("PRAGMA journal_mode = WAL");
        this.#db.exec("PRAGMA synchronous = FULL");
        this.#db.exec("PRAGMA busy_timeout = 5000");
        this.#db.exec("PRAGMA trusted_schema = OFF");
        this.#db.exec("PRAGMA recursive_triggers = OFF");
        const foreignKeys = this.#db.prepare("PRAGMA foreign_keys").get();
        const trustedSchema = this.#db
            .prepare("PRAGMA trusted_schema")
            .get();
        const synchronous = this.#db.prepare("PRAGMA synchronous").get();
        const journalMode = this.#db.prepare("PRAGMA journal_mode").get();
        if (foreignKeys.foreign_keys !== 1 ||
            trustedSchema.trusted_schema !== 0 ||
            Number(synchronous.synchronous) < 2 ||
            (journalMode.journal_mode !== "wal" &&
                journalMode.journal_mode !== "memory")) {
            throw new Error("Lifecycle database safety profile is unavailable");
        }
    }
    #migrate() {
        const exists = this.#db
            .prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = 'schema_metadata'")
            .get();
        if (!exists) {
            const timestamp = this.#timestamp();
            this.#transaction(() => {
                this.#db.exec(MIGRATION_0001);
                this.#db
                    .prepare("INSERT INTO schema_metadata VALUES (1, ?, ?, '0001-initial-lifecycle', ?)")
                    .run(SCHEMA_VERSION, timestamp, sha256(Buffer.from(MIGRATION_0001, "utf8")));
            });
            return;
        }
        const row = this.#db
            .prepare("SELECT schema_version, migration_id, migration_sha256 FROM schema_metadata WHERE singleton = 1")
            .get();
        const expectedDigest = sha256(Buffer.from(MIGRATION_0001, "utf8"));
        if (!row ||
            row.schema_version !== SCHEMA_VERSION ||
            row.migration_id !== "0001-initial-lifecycle" ||
            !(row.migration_sha256 instanceof Uint8Array) ||
            !Buffer.from(row.migration_sha256).equals(expectedDigest)) {
            throw new Error("Lifecycle database schema is unsupported");
        }
    }
    #identity(identity) {
        return Object.freeze({
            issuer: exactHttpsIssuer(identity.issuer),
            subject: boundedIdentity(identity.subjectId, "OAuth subject"),
            organizationKey: identity.organizationId === undefined
                ? ""
                : boundedIdentity(identity.organizationId, "OAuth organization"),
        });
    }
    #existing(identity) {
        const row = this.#db
            .prepare(`SELECT a.subject_id, po.tenant_id, po.initial_workspace_id, po.receipt_id,
          po.provisioning_operation_id
        FROM provisioning_operations po
        JOIN accounts a ON a.account_id = po.account_id
        WHERE po.issuer = ? AND po.external_subject_id = ? AND po.organization_key = ?
          AND po.state = 'committed'`)
            .get(identity.issuer, identity.subject, identity.organizationKey);
        if (!row)
            return null;
        return Object.freeze({
            status: "already_provisioned",
            subjectId: text(row, "subject_id"),
            tenantId: text(row, "tenant_id"),
            workspaceId: text(row, "initial_workspace_id"),
            receiptId: text(row, "receipt_id"),
            provisioningOperationId: text(row, "provisioning_operation_id"),
        });
    }
    #id(prefix) {
        return `${prefix}-${this.#entropy(16).toString("hex")}`;
    }
    #timestamp() {
        return this.#now().toISOString();
    }
    #run(sql, ...values) {
        this.#db.prepare(sql).run(...values);
    }
    #transaction(action) {
        this.#db.exec("BEGIN IMMEDIATE");
        try {
            const result = action();
            this.#db.exec("COMMIT");
            return result;
        }
        catch (error) {
            this.#db.exec("ROLLBACK");
            throw error;
        }
    }
}
class ExistingProvisioningError extends Error {
}
function isUniqueConstraint(error) {
    return (error instanceof Error && /UNIQUE constraint failed/.test(error.message));
}
function allowedOperatorTransition(fromState, toState) {
    if (toState === "suspended") {
        return fromState === "active" || fromState === "reconsent_required";
    }
    if (toState === "export_only") {
        return (fromState === "active" ||
            fromState === "reconsent_required" ||
            fromState === "suspended");
    }
    return fromState === "export_only";
}
function prepareDatabasePath(path) {
    if (existsSync(path)) {
        const stat = lstatSync(path);
        if (!stat.isFile() || stat.isSymbolicLink()) {
            throw new Error("Lifecycle database must be a regular non-symlink file");
        }
        if ((stat.mode & 0o037) !== 0) {
            throw new Error("Lifecycle database must be owner-only or protected group-readable");
        }
        return;
    }
    const descriptor = openSync(path, constants.O_CREAT |
        constants.O_EXCL |
        constants.O_RDWR |
        constants.O_NOFOLLOW, 0o600);
    try {
        fchmodSync(descriptor, 0o600);
    }
    finally {
        closeSync(descriptor);
    }
}
export const SQLITE_LIFECYCLE_SCHEMA_VERSION = SCHEMA_VERSION;
export const TRIAL_AGREEMENT_ACTION_VERSION = ACTION_VERSION;
//# sourceMappingURL=sqlite-lifecycle-store.js.map