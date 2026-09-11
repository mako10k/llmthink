# Issue #43 WIP disposition

Status: local separation record; integration candidate not yet accepted or merged  
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

## Integration gates still open

- Rebuild all tracked generated artifacts from the selected source.
- Confirm the regenerated artifacts match the selected behavior and contain no
  finalize-gate implementation.
- Run the repository-wide test suite, focused Core, CLI, and server tests,
  TypeScript checks, formatting, lint, and repository diff review.
- Obtain separate authority before any push, PR, or merge, then read back the
  remote canonical revision after an authorized integration.
