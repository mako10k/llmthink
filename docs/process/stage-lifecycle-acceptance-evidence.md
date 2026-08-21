# Isolated Stage lifecycle acceptance evidence

- Date: 2026-08-21
- Accepted commit: `ee0b112`
- Host class: existing ConoHa VPS, isolated transient test tree only
- Node.js: `v24.19.0`
- PERT task: `ACCEPT_STAGE_LIFECYCLE`

## Isolation and authority

The accepted commit was transferred through the approved SSH jump route into
`/tmp/llmthink-stage-ee0b112`. Dependencies and build output existed only under that tree. The
test did not alter `/opt/llmthink/current`, `/var/lib/llmthink`, `/etc/llmthink`, systemd, Caddy,
DNS, WorkOS, R2, public enrollment, or Production configuration.

After validation, the complete transient tree was deleted. Readback showed:

- `llmthink-hosted-mcp.service`: `active`;
- deployed target unchanged at `/opt/llmthink/releases/e803cfe5777ed036cfa6ad8523504adac76c2666`;
- both `/tmp/llmthink-stage-fdd20e9` and `/tmp/llmthink-stage-ee0b112`: absent.

## Accepted server gate

The exact command, after a clean root dependency install and build, was:

```text
node --import tsx --test test/server/*.test.ts
```

Result: 101 tests, 100 passed, 1 intentionally skipped real-restic integration, 0 failed.

The accepted server gate covers:

- explicit first agreement, replay, CSRF/nonce binding, stale terms, and re-consent;
- two independent SQLite connections released concurrently, producing exactly one account,
  tenant, workspace, receipt, recovery row, provisioning operation, and outbox event;
- suspension, export-only, closure, forbidden transition skipping, and normal-access denial;
- recovery possession creating only pending review, operator-approved exact identity replacement,
  mapping revision increment, credential rotation, and old-identity/old-credential rejection;
- canonical tenant/workspace-bounded archive generation, metadata-only receipts, and no receipt on
  size failure;
- cross-tenant/workspace rejection, invalid JWT trust/time/audience/issuer rejection, bounded
  privacy-safe security observations, restart-safe SQLite reopening, schema 0001 to 0002 migration,
  online backup, isolated restore validation, and fail-closed reconciliation of corrupt or orphan
  restore candidates.

Typecheck, build, lint, and complexity also passed in the isolated tree before the final server
gate.

## Investigated non-acceptance attempts

The first run invoked npm through `/opt/node/current` without placing that directory first in
`PATH`; npm scripts therefore used system Node 18 and failed before lifecycle execution because
`node:sqlite` was unavailable. The corrected Node 24 run removed that environment error.

A repository-wide run subsequently reached 214 passed, 1 skipped, and 5 failed UI-preview tests.
Those five required a Playwright Chromium binary absent from the VPS and were unrelated to the
server lifecycle. No browser binary was installed into the operator home merely to clear this
server gate. Local repository-wide validation for the implementation commit had already passed
219 tests with 1 intentional skip and 0 failures.

## Residual boundary

- This accepts the lifecycle implementation on an isolated VPS Stage execution boundary. It does
  not claim that the current public hosted process uses SQLite lifecycle authority; the deployed
  process remains the unchanged legacy/static-registry release.
- No real WorkOS login, callback, refresh, logout, or provider revocation was performed. Those are
  governed by the separate OAuth Stage acceptance task.
- The real-restic integration remained intentionally skipped; previously accepted backup/restore
  evidence remains separate.
- Recovery/archive HTTP publication, operator runbook, public enrollment, release, and Production
  activation remain separately authorized.
