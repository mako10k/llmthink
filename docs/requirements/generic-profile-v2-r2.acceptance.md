# Acceptance Record: Generic Profile and Audit Contract V2 R2

Status: accepted requirement snapshot

Decision date: 2026-09-11

Decision owner: llmthink decision owner

Owner decision: `Generic ACCEPT、RCA REVISE`

## Accepted subject

- Candidate: `docs/requirements/generic-profile-v2-r2.md`
- SHA-256: `89f20a526d4bf67df4c9576b529d3e8b13a617218935d12551fc2e3f0b9e8cc8`
- External contract name: Generic Profile and Audit Contract V2
- Requirement revision: R2
- First-owner route: `REVIEW_THEN_DECIDE`
- Independent-review report: `docs/requirements/v2-r2-independent-review.md`
- Review-report SHA-256: `7081bf41bd1be9bbb53d14aa713bef22bb845afb6cfecdc2022346652ac71ae8`

Acceptance applies only to the exact candidate bytes identified above. Any requirement-text change
creates a new revision and requires a new review lifecycle.

## Decision disposition

- Generic V2 R2 is accepted as the normative requirement for an explicitly selected V2 grammar,
  immutable versioned profiles, closed declarative constraints, structural audit, read-only DSLQL,
  V1 coexistence and migration boundaries, and profile-aware offline help navigation.
- V1 remains the default and is not replaced, migrated, deprecated, or retired by this acceptance.
- The dependent RCA Profile R1 requirement R2 is not accepted. The owner selected `REVISE`, so its
  requirement model returns to Step 1 in a new revision.
- Review evidence gaps recorded for exact profile schema, bundled profile bytes, concrete CLI help
  route grammar, and registry layout remain downstream verification or design obligations. They do
  not become new requirement text through this record.

## Authority boundary

This acceptance does not authorize an ADR, design, PERT mutation, implementation, document or
thought-store migration, commit, push, merge, release, publication, deployment, production
activation, Issue mutation, namespace work, external I/O, or V1 cutover. Each requires its own
applicable authority and verification.
