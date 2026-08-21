# Limited trial enrollment authorization package

Date: 2026-08-21

Decision state: **No-Go pending prerequisite alignment**

This package prepares an invite-only pilot but does not invite a person, send an email, issue or
share a credential, publish the Plugin, change Production, or authorize billing.

## Proposed initial pilot boundary

- Operator: 勝又誠
- Support: `mako10k@mk10.org`
- Status and material-notice page: `https://llmthink.mk10.org/status`
- External participants: at most one named person in the first pilot
- Price: free trial only; no paid-plan or future-price consent
- Admission: manual WorkOS invitation followed by an exact server-side issuer and subject mapping
- Tenant model: one dedicated tenant and initial workspace for that identity; no shared tenant
- Plugin source: repository marketplace `llmthink-trial`
- Plugin version: `1.2.0+codex.20260821115249`
- Plugin manifest SHA-256: `3675be49aa1a66bb151f3fbb9243e5c4821078cf729bbdc80f3b3e619ba20e32`
- Marketplace SHA-256: `e65b4152bf39d4b6681d64e5e9203fc14c7e1f82647c7b6909f6bf6a0affed72`
- Initial Plugin implementation commit: `df62f346bd4fc933b8f021c4f03afb2939fa8a47`
- Universal Plugin Directory, general registration, public discovery, Production activation,
  release, billing, and paid plans: excluded

## Exact user-facing documents

| Artifact                                      | Version | Effective date | SHA-256                                                            |
| --------------------------------------------- | ------- | -------------- | ------------------------------------------------------------------ |
| `docs/legal/trial-terms-ja-v1.md`             | v1      | 2026-08-21     | `b40e20f16af8f927027b34ca97c8a729d65178a93f999006f77e8a3821723af1` |
| `docs/legal/trial-important-summary-ja-v1.md` | v1      | 2026-08-21     | `c81803b0b85713ccc0a79908949774ece7023439fe34088051140d84e53fef2c` |
| `docs/legal/trial-privacy-notice-ja-v2.md`    | v2      | 2026-08-21     | `88028714e007f7aea2c5ef829b9fa42a9c428136eb3a8ced942669e83c9be610` |

The named person must see the full documents and important summary and perform the explicit
agreement action before tenant provisioning. Login, accepting a WorkOS invitation, installing the
Plugin, or continuing to use it is not agreement.

## Frozen service policy

- Scope allowlist: `thought:read`, `thought:write`, `thought:finalize`, and `audit:run`; the server
  binds the admitted identity to an exact fixed subset.
- Default per-subject rate limit: 120 requests per 60 seconds.
- Request timeout: 30 seconds.
- MCP request body limit: 1 MiB; text input limit: 64 KiB.
- Capacity admission: one external participant initially. There is no implemented per-tenant
  storage quota, so the operator must pause admission or suspend an account on abnormal growth.
- Abuse response: fail closed on unknown identity or workspace; operator may suspend access and
  provide bounded support guidance.
- Material-change notice: at least 14 days except urgent or impossible circumstances.
- Termination/archive window: at least 30 days from notice.
- Agreement receipts: five years; security audit records: one year, as accepted in the legal
  package.
- Backup remains manual and best-effort; users must retain their own archive.

## Admission sequence after all blockers close

1. Freeze one named person and the exact email used only for the WorkOS invitation.
2. Create one WorkOS Staging invitation; general sign-up remains disabled.
3. Let the named person authenticate; do not infer authorization from email alone.
4. Obtain and review the exact WorkOS issuer and subject without recording unnecessary claims.
5. Add exactly one active mapping to a new dedicated tenant/workspace and fixed trial scope policy.
6. Present the three exact documents and record explicit agreement before provisioning completes.
7. Provide the repository Plugin installation instructions without a static shared secret.
8. Run read-only login and tenant-boundary checks before enabling writes.
9. Read back account, tenant, workspace, scope-policy revision, agreement receipt, and service
   status without exposing tokens or personal claims.

## Rollback and stop conditions

- Before first use: revoke the WorkOS invitation and do not create the mapping.
- After mapping but before agreement: disable the mapping; do not provision or expose a tenant.
- After activation: suspend the exact account, revoke its sessions or credential, preserve the
  audit trail, and use export-only/closure transitions under the accepted lifecycle.
- Stop immediately on identity ambiguity, shared/static credential requirement, missing agreement
  receipt, tenant/workspace mismatch, scope widening, stale terms, unavailable status/support
  route, or unverified deployed revision.
- The continuing operator test credential is not distributed and is not revoked by pilot rollback.

## Evidence already accepted

- Isolated Stage lifecycle suite: 101 tests, 100 passed and one intentional real-restic skip.
- Limited Plugin validator and contract tests passed.
- Fresh-process auditor, author, reflector, two bounded writes, and independent readback passed.
- Cross-tenant and cross-workspace negative fixtures passed.
- WorkOS Staging general sign-up is disabled; browser readback shows sign-in only.
- Public OAuth protected-resource discovery remains healthy.

## Blocking prerequisites

### B1 — external-participant refresh and revocation evidence is unaccepted

The repository and installed local Plugin use client-managed OAuth and contain no static-token
environment variable. A separated client completed login, exact subject mapping through explicit
onboarding, authenticated MCP use, and unauthenticated fail-closed readback. Refresh and provider-
side revocation have not been exercised with a disposable external-participant session. Complete
that bounded evidence before inviting another person.

### B2 — lifecycle onboarding deployment closed for the operator trial

The lifecycle onboarding route was deployed and used for explicit agreement and provisioning. The
active limited-trial revision at the closeout checkpoint is
`df8e6830dd985a3786c77bc1f1f99922e5144947`; service and filesystem readback also verified the
tenant-bound deletion rehearsal. This closes the earlier deployment blocker without classifying the
service as Production or enabling general registration.

### B3 — the repository marketplace commit is not distributed

The local branch contains the OAuth Plugin candidate and is ahead of its remote. The approved
closeout push makes the branch available for operator continuity, but does not itself select a
named-participant distribution revision or send an invitation. Release and public publication
remain separately gated.

## Decision required after blockers close

Approval must identify one maximum participant count, the exact deploy and Plugin revisions, the
distribution mechanism, and whether the first participant uses accepted OAuth. Approval of this
package now would authorize prerequisite work only; it would not authorize sending an invitation.
