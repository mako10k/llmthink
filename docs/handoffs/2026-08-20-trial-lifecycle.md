# Trial account lifecycle handoff — 2026-08-20

## Stop boundary

Work stopped for the day after publishing and verifying the public status page.
Do not start onboarding, recovery/export, Stage work, public enrollment, billing,
release, or further Production changes from this handoff without the applicable
owner gate.

## Checkout

- Repository: `/home/katsumata-m/llmthink`
- Branch: `work/trial-lifecycle-terms-20260820`
- Checkpoint before this handoff: `443c2d5` (`Record status page completion`)
- The branch has not been pushed during this work session.

## Completed today

- Accepted and implemented the separated SQLite lifecycle control plane.
- Registered GitHub Issue #28 for selecting a stable SQLite driver before Stage
  activation: <https://github.com/mako10k/llmthink/issues/28>
- Drafted the Japanese trial terms, important-summary copy, and Privacy Notice.
- Fixed operator `勝又誠`, contact `mako10k@mk10.org`, notification period of at
  least 14 days, and archive period of at least 30 days.
- Implemented the unauthenticated static status page independently of the hosted
  MCP process and published it at <https://llmthink.mk10.org/status>.
- Verified `/status` and `/status/` return HTTP 200, `/status/unknown` returns
  HTTP 404, security headers are present, Caddy is active, and deployed file
  digests match commit `5ccfc58`.

Deployed digests:

- `/etc/caddy/Caddyfile`:
  `sha256:06bb4ca65ee52185a40c4b74725a9f0d5b861ffe21f437b189580610fdda1fda`
- `/var/www/llmthink-status/index.html`:
  `sha256:811a46300dc5fefd74a29a4373a069d7038fab82823d5177c721f84927b919a3`

The public and loopback `/healthz` route currently returns HTTP 404. This was
observed after the status deployment and is not caused by the Caddy status
matcher; treat the deployed application version and health-check contract as a
separate verification item.

## Frozen incomplete work

`APPROVE_TERMS_COPY` remains suspended. The public status-page requirement is
complete, but these items remain:

1. Owner exact-text self-review of the terms, summary, and Privacy Notice.
2. Select the effective date.
3. Design and implement backup before approval/activation.

There is currently no backup configuration. Backup design must preserve the
confidentiality of stored thought data and use authenticated, encrypted
transport and protected storage. Do not select a provider, copy live data, or
create credentials merely to clear the terms gate. Decide separately:

- threat model and operator/recovery access;
- encryption before transfer and key custody separated from backup storage;
- off-host destination and provider/data-location disclosure;
- retention, deletion, immutability/versioning, and cost bounds;
- tenant-safe restore procedure and periodic restore verification;
- logging that contains no content, token, recovery secret, or key material.

The current Privacy Notice says no dedicated external backup service is in use,
but its retention table and safety-measure list still describe operational
backup. Before terms approval, revise these statements so they distinguish the
current absence of backup from the future 30-day retention policy.

## PERT state

- Plan: `plans/trial-account-lifecycle.pert`
- `IMPLEMENT_STATUS_PAGE`: done
- `APPROVE_TERMS_COPY`: suspended
- `perttool dag next` currently recommends `IMPLEMENT_ONBOARDING`, but this is
  planning evidence only. Do not start it while the user has ended the day, and
  do not interpret it as approval of the still-unapproved terms copy.
- Latest observed declared active-date velocity candidate: `7.875p/1d` from
  `DESIGN_SQLITE_SCHEMA`, `IMPLEMENT_LIFECYCLE_CORE`, and
  `IMPLEMENT_STATUS_PAGE`.

## Verification already completed

- `perttool document check plans/trial-account-lifecycle.pert`
- `sealgraph fsck`
- Prettier checks for legal and status artifacts
- Caddy 2.6.2 validation on the target VPS
- External HTTP status-page readback and exact body-digest comparison

No public enrollment, paid plan, billing, Stage acceptance, release, or Git
remote publication was performed.

## Resume sequence

1. Read this handoff and inspect `git status --short --branch` and `git log -5`.
2. Verify <https://llmthink.mk10.org/status> remains reachable and compare the
   two deployed digests above before changing deployment state.
3. Run `perttool document check plans/trial-account-lifecycle.pert` and
   `perttool dag next plans/trial-account-lifecycle.pert --format text`.
4. Create a separate backup-design task and acceptance boundary before choosing
   a provider or writing backup code.
5. After backup design is accepted and implemented, correct the Privacy Notice,
   reseal the legal artifacts, set the effective date, and present exact bytes
   for owner self-approval.

Stop and request owner direction before any external backup account creation,
live-data transfer, terms activation, Stage operation, public enrollment,
billing, release, or Production lifecycle activation.
