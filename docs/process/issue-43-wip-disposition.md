# Issue #43 WIP disposition

Status: integrated and distribution-corrected through PR #47
Date: 2026-09-11

## Snapshot and authority

- Verified remote canonical base: `0dd69fa65dd05cb1dffd98bd6ecb45696caaff50`
- Complete local preservation commit: `ec4f8d7e250c5278d1df64dbe0ca4139ad9c0e39`
- Governing PERT revision: `825d52b042575dcaa43cbdf63c569f45565be9ed`
- Owner disposition: integrate the reusable V1 audit safety and provenance slice;
  keep unaccepted finalize-gate material separate; do not revive the withdrawn
  semantic-audit artifact; defer absent inventory, doctor, and reachable-orphan
  work unless a current V1 need independently justifies it.
- The instruction to proceed authorizes this local separation work. It does not
  authorize push, PR creation, merge, Issue mutation, release, publication, or
  deployment.

Every material hunk in a listed file has the same disposition as that file. No
mixed-disposition file was found. Generated files are not independent design
inputs; they must be reproduced from the selected source before integration.

## Integrate

These files form the source, contract, documentation, and test candidate:

- `README.md`
- `docs/adr/0023-withdraw-semantic-audit-artifact-v1.md`
- `docs/adr/README.md`
- `docs/specs/audit-rules.md`
- `packages/core/src/analyzer/audit.ts`
- `packages/core/src/index.ts`
- `packages/core/src/model/diagnostics.ts`
- `packages/core/src/model/version.ts`
- `packages/core/src/presentation/report.ts`
- `packages/core/test/analyzer/audit.test.ts`
- `packages/core/test/model/version.test.ts`
- `packages/server/src/http.ts`
- `packages/server/test/http.test.ts`
- `schemas/audit-result.schema.json`
- `src/check.ts`
- `src/cli.ts`
- `test/cli/dsl-check.test.ts`
- `test/dsl/file-extension.test.ts`

The selected behavior is limited to the non-persistent `dsl check` and
`--fail-on` path, removal of unsupported semantic fallbacks and contradiction
noise, explicit audit provenance and semantic availability, compatible report
and schema propagation, direct-V1 orphan metadata, and the accepted withdrawal
record in ADR-0023.

## Regenerate from selected source

- `dist/cli.js`
- `dist/cli.js.map`
- `dist/check.d.ts`
- `dist/check.js`
- `dist/check.js.map`
- `packages/core/dist/analyzer/audit.js`
- `packages/core/dist/analyzer/audit.js.map`
- `packages/core/dist/index.d.ts`
- `packages/core/dist/index.js`
- `packages/core/dist/index.js.map`
- `packages/core/dist/model/diagnostics.d.ts`
- `packages/core/dist/model/version.d.ts`
- `packages/core/dist/model/version.js`
- `packages/core/dist/model/version.js.map`
- `packages/core/dist/presentation/report.js`
- `packages/core/dist/presentation/report.js.map`
- `packages/server/dist/http.js`
- `packages/server/dist/http.js.map`
- `vscode-extension/dist/extension.js`
- `vscode-extension/dist/llmthink-lsp.js`

The preservation snapshot versions are present in the extracted tree only as a
comparison baseline. They must not be accepted without a clean build and an
exact generated-artifact diff.

## Preserve outside the integration candidate

- `docs/process/finalize-clean-audit-gate-v1-requirement.md`
- `docs/process/finalize-clean-audit-gate-v1-review-input.md`

Both files remain available in preservation commit `ec4f8d7`. They are
unaccepted requirement candidates and are not evidence that a V1 finalization
gate is required or implemented.

## Reject or defer

- Dedicated `semantic-audit-v1` artifact: rejected by accepted ADR-0023; no
  implementation is selected.
- V1 inventory or doctor command: deferred; no implementation exists in the
  preserved WIP.
- V1 reachable-orphan mode: deferred to the generic V2 graph constraint work
  unless a separate current V1 requirement is accepted.
- No changed file or hunk is discarded from the preservation commit.

## Validation readback

Validation used supported Node.js `24.19.0` with dependencies installed from the
root and VS Code extension lockfiles.

- Root build passed.
- VS Code extension build and typecheck passed. A second build produced the same
  bundle digests.
- `npm run test:all` passed 261 tests: Core 117, Contracts 24, Server 67, and
  App 53.
- Root typecheck, formatting check, and lint passed.
- No `require-clean-audit` or `FCAG-V1-R1` implementation reference exists in
  the integration candidate.
- The first App test attempt reported eight `MODULE_NOT_FOUND` failures for
  `elkjs` while `vscode-extension/node_modules` was absent. After installing the
  extension lockfile with `npm --prefix vscode-extension ci`, the complete App
  suite passed.
- Dependency installation reported three root audit findings and one extension
  audit finding. No dependency or lockfile change was made, and `npm audit fix`
  was not run as part of this integration slice.

## Post-merge readback

- PERT PR #45 merged as `31a61def88519aef1e664be3a024f47ddfb728ca`.
- Core-slice PR #46 passed `server-ci` and merged as
  `3ef17b2f97a2c611b7a4ed9b93a5238f26743391`.
- A clean post-merge worktree exposed a missing tracked `dist/check.js` runtime
  module. Corrective PR #47 passed `cli-ci`, merged as
  `747c8bfb4fbcfcd417d5f855c18e7b4ddd3077f3`, and a fresh canonical checkout
  executed the tracked distributed CLI successfully.
