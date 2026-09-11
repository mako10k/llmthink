# Issue #43 baseline reconciliation

Status: correction required before reconciliation can complete
Date: 2026-09-11

## Canonical input

- PERT merge: PR #45, `31a61def88519aef1e664be3a024f47ddfb728ca`
- Core-slice merge: PR #46, `3ef17b2f97a2c611b7a4ed9b93a5238f26743391`
- Core-slice CI: `server-ci / server` succeeded
- Complete preserved WIP: `ec4f8d7e250c5278d1df64dbe0ca4139ad9c0e39`

## Baseline comparison

| V2 plan assumption | Canonical V1 observation | Result |
| --- | --- | --- |
| A non-persistent broad audit command exists | `dsl check` accepts files, directories, stdin, and text; its result is `persisted: false` | confirmed |
| Audit reports identify their input | `source_sha256` is present in Core, CLI, schema, and server tests | confirmed |
| Grammar, package, and engine versions are explicit | The raw report exposes all three fields | confirmed |
| Semantic evidence is not fabricated | Similarity candidates require observed embeddings and report availability | confirmed |
| V1 orphan semantics remain bounded | Reports identify `direct-v1` and declare transitive reachability not expressible in grammar V1 | confirmed |
| Dedicated semantic-audit artifact is not part of V1 | Accepted ADR-0023 records its withdrawal | confirmed |
| Finalize gate, inventory, doctor, and reachable-orphan expansion are not implied | No such implementation is present in the integrated slice | confirmed |
| The distributed CLI is runnable from tracked canonical contents | `dist/cli.js` imports `dist/check.js`, but the merge did not track that generated module | contradiction |

## Audited RCA

- Root cause: the root generated-artifact contract ignores `dist/*` and its
  allowlist was not extended when `src/check.ts` became a runtime module of the
  tracked distributed CLI.
- Contributing condition: the extraction build created the ignored files in the
  same worktree, where the CLI could use them without proving they were tracked.
- Escape cause: source-based tests did not start the tracked distributed CLI,
  and no root CLI workflow covered the changed paths.
- Correction: allowlist and track `dist/check.{js,d.ts,js.map}`.
- Recurrence prevention: recursively verify that relative runtime modules
  reachable from `dist/cli.js` exist and are tracked, execute the distributed
  `dsl check`, and run those checks in a focused CLI workflow before build.

## Current decision

Keep `INTEGRATE_ISSUE43_CORE_SLICE` active and
`ISSUE43_BASELINE_RECONCILED` unreached. After the correction is merged, run the
distributed CLI from a fresh canonical checkout, read back remote main, and
repeat this comparison before starting V2 requirement authoring.
