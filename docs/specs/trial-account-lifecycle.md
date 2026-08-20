# Trial account lifecycle specification

## 1. Status and scope

Status: design baseline derived from accepted ADR-0011. Implementation, legal-copy
approval, public enrollment, paid plans, and Production activation remain unapproved.

This specification defines four contracts:

1. immutable versioned terms artifacts;
2. minimal explicit-agreement receipts;
3. account and access-state transitions;
4. idempotent per-user tenant/workspace provisioning.

It supplements ADR-0010 identity mapping and preserves ADR-0008 tenant/workspace
isolation. Organization membership, invitations, shared tenants, cross-tenant access,
billing, and payment processing are out of scope.

## 2. Security invariants

- Authentication, agreement, provisioning, and authorization are separate gates.
- A valid WorkOS token without an active account never authorizes a resource operation.
- Invalid credentials return an authentication failure. A valid identity requiring
  onboarding, re-consent, suspension review, or closure returns a bounded authorization
  state without exposing whether any other identity exists.
- The exact external identity key is `(issuer, sub, org_id-or-absent)`. It is never
  derived from email or display name.
- Each automatically provisioned account owns exactly one tenant. No wildcard or
  shared-trial-tenant mapping exists.
- Client input cannot select `subject_id`, `tenant_id`, `workspace_id`, scopes, account
  state, terms version, or acceptance time.
- Terms acceptance and provisioning must be replay-safe and concurrency-safe.
- Logs and client errors contain stable codes and correlation IDs, not tokens, email,
  agreement identifiers, recovery secrets, or raw external subjects.

## 3. Terms artifact

### 3.1 Logical record

```ts
interface TermsArtifact {
  termsId: string;
  version: string;
  locale: string;
  kind: "trial_terms" | "privacy_notice";
  state: "draft" | "active" | "retired";
  effectiveAt: string;
  contentType: "text/markdown; charset=utf-8";
  contentBytes: Uint8Array;
  contentSha256: string;
  summaryBytes: Uint8Array;
  summarySha256: string;
  createdAt: string;
}
```

### 3.2 Rules

- `termsId` identifies one immutable material generation. `version` is its public,
  human-readable label and is unique within `kind` and `locale`.
- Digests are lowercase SHA-256 over the exact stored UTF-8 bytes. Rendering must not
  become the evidence boundary.
- Once an artifact is active or referenced by a receipt, its content, summary,
  version, locale, digests, and effective time are immutable.
- Activating a new trial-terms artifact is an explicit operator action. At most one
  artifact per `kind` and locale is active at an instant.
- A correction that changes rights or obligations creates a new version. A purely
  presentational correction may keep the public version only when the old bytes and
  correction history remain retrievable and legal review classifies it as immaterial.
- The important summary must include trial status, change possibility, possible future
  paid offering, no continuity guarantee, data responsibility split, and export/closure
  treatment. The full terms remain authoritative.

## 4. Agreement receipt

```ts
interface AgreementReceipt {
  receiptId: string;
  issuer: string;
  externalSubjectId: string;
  organizationId?: string;
  subjectId: string;
  termsId: string;
  termsVersion: string;
  contentSha256: string;
  summarySha256: string;
  actionVersion: "trial-agree-v1";
  acceptedAt: string;
  provisioningOperationId: string;
}
```

Rules:

- A receipt is append-only. Revocation, supersession, or account closure adds a state
  transition; it does not delete or rewrite the receipt while retention is required.
- `(external identity key, termsId, actionVersion)` is unique.
- `acceptedAt` comes from the server clock after the explicit POST is authorized; the
  browser cannot supply it.
- The POST requires an authenticated session, an unpredictable short-lived onboarding
  nonce bound to the exact identity and terms ID, and CSRF protection appropriate to
  the chosen browser session mechanism.
- The submitted terms ID must still be active. If it changed after display, return
  `terms_version_changed` and require display and agreement again.
- Email, display name, IP address, User-Agent, upstream credentials, access token, and
  recovery secret are not receipt fields.

## 5. Account model and lifecycle

```ts
type AccountState =
  | "active"
  | "reconsent_required"
  | "suspended"
  | "export_only"
  | "closed";

interface TrialAccount {
  subjectId: string;
  tenantId: string;
  initialWorkspaceId: string;
  state: AccountState;
  acceptedTermsId: string;
  scopePolicyId: string;
  mappingRevision: number;
  createdAt: string;
  updatedAt: string;
}
```

The external identity mapping remains a separate record keyed by exact issuer, subject,
and optional organization. Internal IDs are random, non-semantic hosted IDs.

### 5.1 State transitions

| From | Event | To | Resource access |
|---|---|---|---|
| absent | current terms agreed and provisioning committed | active | trial policy |
| active | material terms version activated | reconsent_required | terms, export, closure only |
| reconsent_required | new current terms agreed | active | trial policy |
| active or reconsent_required | operator security/abuse action | suspended | none except support-defined recovery |
| active, reconsent_required, or suspended | service wind-down or accepted closure flow | export_only | export, status, closure only |
| export_only | retention/export window ends or closure completes | closed | status receipt only or none |
| suspended | reviewed reinstatement | active or reconsent_required | determined by current terms receipt |

No transition out of `closed` reuses the old tenant automatically. Recovery or migration
is an audited operator operation, not a client-controlled state transition.

## 6. Idempotent provisioning

### 6.1 Operation input

The server constructs the operation from:

- verified external identity key;
- active terms artifact identity and digests;
- validated onboarding nonce and explicit action version;
- fixed server-side trial scope policy.

The client supplies none of the resulting internal IDs or scopes.

### 6.2 Transaction contract

Within one serializable lifecycle-store transaction:

1. lock or re-read the active terms artifact;
2. resolve the exact external identity mapping;
3. if an account exists, return its current state without creating another;
4. reserve one unique provisioning operation for the external identity key;
5. generate subject, tenant, workspace, receipt, and recovery credential identifiers;
6. insert the agreement receipt;
7. insert account, external mapping, tenant ownership, initial workspace, fixed scope
   policy binding, and hashed recovery credential;
8. commit once, then return the same result for every replay of the operation.

Unique constraints, not process-local locks, enforce one mapping, one account, and one
tenant per external identity. A conflicting retry re-reads the winning committed result.

The lifecycle store must support atomic transactions and durable unique constraints.
ADR-0012 selects a local SQLite database outside the distributable package and inside the
existing protected service data boundary as the initial lifecycle control-plane authority.

Registry, agreement, account state, tenant catalog, workspace catalog, scope-policy binding,
recovery verification, and outbox are separate tables behind separate repository ports. They
share one physical SQLite transaction only where first provisioning and authorization
consistency require it. The registry owns no thought content or filesystem path; the tenant
catalog contains no WorkOS token, email, or display name; the ThoughtRepository accepts only
the verified internal tenant/workspace context.

Thought content remains behind `ThoughtRepository`; introducing a lifecycle store does not
make its database keys public thought identities and does not migrate thought revisions.

### 6.3 Filesystem workspace realization

If the existing file repository creates tenant/workspace directories lazily, the lifecycle
transaction commits ownership first and the repository realizes directories only from the
committed server-side context. Empty directory creation is not provisioning evidence.

If eager external filesystem creation becomes necessary, use an outbox state:

```text
transaction committed -> realization pending -> realized
                                  └-> retryable failure
```

Resource access fails closed until required realization is complete. Reconciliation may
retry an exact pending operation but must never invent ownership from directory names.

## 7. Recovery credential

- Generate at least 128 bits of cryptographically secure entropy.
- Present the encoded recovery credential once after successful provisioning.
- Store only a versioned password-hash/KDF verification representation plus issued,
  rotated, revoked, and last-used audit state.
- Never place the credential in URLs, logs, analytics, email, WorkOS metadata, or MCP tool
  results that may be retained automatically.
- Possession starts an operator-reviewed recovery request; it does not directly return
  data or replace an external identity.
- Successful recovery rotates the credential, increments `mappingRevision`, preserves the
  tenant, and records old and new external identity keys in restricted audit evidence.

## 8. HTTP and MCP behavior

After JWT verification, account admission returns one of these stable states:

| Code | HTTP | Meaning | Safe next action |
|---|---:|---|---|
| `account_terms_required` | 403 | no current agreement/account | open exact HTTPS onboarding URL |
| `account_reconsent_required` | 403 | material terms changed | open exact HTTPS re-consent URL |
| `account_suspended` | 403 | operator/security suspension | show bounded support guidance |
| `account_export_only` | 403 | ordinary MCP use ended | open archive/closure URL |
| `account_unavailable` | 403 | mapping cannot be safely resolved | retry later or contact support |

401 remains reserved for absent or invalid credentials and its OAuth challenge. Responses
must not include raw WorkOS claims, email, account IDs, tenant IDs, recovery material, or
whether another account exists. The onboarding URL is server-configured, same-origin HTTPS,
bounded in length, and never accepted from a request parameter.

Because MCP clients may not render an onboarding URL reliably, the same URL and recovery
instructions must be published in operator-controlled documentation. This is a UX fallback,
not authority to bypass the agreement gate.

## 9. Scope policy

The account stores `scopePolicyId`, not a client-selected scope array. A versioned trial
policy resolves to an allowlist drawn from `thought:read`, `thought:write`,
`thought:finalize`, and `audit:run`.

The initial policy contents remain a separate operational choice. Changing the policy must
be audited; widening it does not occur from OAuth scopes or tool requests and may require
user notice or re-consent when it materially changes the service.

## 10. Acceptance evidence

Implementation acceptance requires tests proving:

- invalid token is 401 while valid-but-unregistered identity is bounded 403;
- no receipt is created by GET, login, link display, failed POST, or MCP retry;
- changed terms between display and POST cannot be accepted accidentally;
- concurrent first-agreement requests produce one receipt, account, tenant, and workspace;
- retries return the same provisioning result without revealing the recovery secret again;
- every account state permits only its declared operation subset;
- cross-account, cross-tenant, client-selected-ID, and client-selected-scope attempts fail;
- logs, errors, backups, and test fixtures contain no token, email, or recovery plaintext;
- restart and interrupted-realization recovery preserve committed ownership;
- archive-only and closure paths work without accepting new commercial terms;
- static registry migration is explicit, reversible before public enrollment, and does not
  widen any existing mapping.

## 11. Decision frontier

Before implementation, separately accept:

1. exact SQLite schema, migration, backup, restore, permission, and encryption profile under
   the accepted ADR-0012 boundary;
2. exact trial scope policy;
3. Japanese terms and privacy text after legal review;
4. notification and archive grace periods;
5. onboarding session/CSRF mechanism and public URL;
6. retention periods for receipts, account audit, closed mappings, and backups;
7. abuse suspension and operator recovery procedure.
