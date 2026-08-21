# Recovery and export lifecycle implementation evidence

- Date: 2026-08-21
- Scope: local implementation only
- PERT task: `IMPLEMENT_RECOVERY_EXPORT`
- Production, Stage, public enrollment, deployment, email, and external writes: not performed

## Implemented boundary

- New recovery credentials contain an opaque lookup identifier and 256-bit secret. SQLite stores
  only the existing `scrypt-v1` salt/verifier representation.
- Presenting a valid credential creates one pending operator-review request. It does not return
  account data or replace identity authority.
- Operator approval atomically replaces the exact external identity mapping, increments the
  mapping revision, rotates the credential, and leaves the existing tenant/workspace ownership
  unchanged. Old credentials and mappings no longer authorize access.
- Suspension remains fail-closed. `export_only` disables the normal account resolver while the
  archive authority permits only the exact active identity for that account. `closed` rejects
  archive creation and cannot be reopened by this API.
- Entering `export_only` records a 30-day archive-window transition. Closing records operational
  closure. These records do not claim physical deletion from backups.
- The archive service reads only the server-derived tenant/workspace context, emits canonical
  UTF-8 JSON containing current snapshots including thought history/reflections, and records only
  SHA-256, byte length, item count, format, and opaque ownership identifiers in SQLite.
- Archive size and item limits are bounded. A read or limit failure creates no archive receipt.

## Privacy and residual limits

- Recovery secrets are returned only at initial provisioning or successful operator-approved
  rotation; they are not stored in requests, receipts, logs, email, or archive metadata.
- Recovery requests necessarily retain the old mapping reference and proposed exact identity in
  the protected lifecycle database for operator review. They are not exposed through the normal
  MCP account resolver.
- The implementation provides application/store APIs but does not publish a recovery or archive
  HTTP route. Stage wiring, operator procedure, rate limiting, notification, physical deletion,
  and Production activation remain separately gated.
- The 30-day transition is a recorded deadline. Automated deletion and backup expiry are not
  asserted by this implementation.

## Verification

Focused tests cover invalid recovery material, pending-review non-authority, exact mapping
replacement, revision increment, credential rotation and replay rejection, tenant preservation,
canonical archive generation, metadata-only receipts, size-failure non-write, export-only access,
closure, and skipped-transition rejection. Full repository validation results are recorded when
the implementation task is completed.

Completed local validation:

- `npm test`: 219 passed, 1 intentionally skipped real-restic integration, 0 failed;
- `npm run typecheck`: passed;
- `npm run build`: passed;
- `npm run lint -- --no-warn-ignored`: passed;
- `npm run complexity`: passed;
- Prettier was applied to every changed handwritten file. Repository-wide `format:check` still
  reports only pre-existing `.sealgraph/logs/recovery/*.json` formatting artifacts.
