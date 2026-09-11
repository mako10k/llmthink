# Independent Review Report: Impact-Aware RCA Profile R1 Requirement R3

Status: completed; Step 3 report

Review date: 2026-09-11

First-owner route: `REVIEW_THEN_DECIDE`

Owner-added questions: none

Reviewer: Codex independent-review pass with candidate-authoring state held read-only

## Reviewed snapshots

| Subject                                 | Path                                            | SHA-256                                                            |
| --------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| RCA Profile R1 requirement R3 candidate | `docs/requirements/rca-profile-r1-r3.md`        | `6f3817a9285d7cbea6b7981977e8765a5a31060205f91fa15d464b008c132312` |
| RCA R3 review input                     | `docs/requirements/rca-profile-r1-r3.review.md` | `60c7189e55b038dd803b20ba5cad304a787804dc1c48a63148930cdfad959629` |
| Accepted Generic V2 R2 requirement      | `docs/requirements/generic-profile-v2-r2.md`    | `89f20a526d4bf67df4c9576b529d3e8b13a617218935d12551fc2e3f0b9e8cc8` |
| Prior R2 independent review             | `docs/requirements/v2-r2-independent-review.md` | `7081bf41bd1be9bbb53d14aa713bef22bb845afb6cfecdc2022346652ac71ae8` |

The candidate and review-input digests were re-read before and after review. Candidate bytes were
not edited.

## Evidence checked

- Live GitHub Issue #44 body digest remained
  `e8998c62c2c8ff7de9ab3725f9ecd62b301b63249626baff8927815a93f76d4b`, matching the frozen source.
- Generic V2 R2 remains the accepted exact predecessor and exposes only the twelve closed constraint
  operators listed in its section 7.
- R3 was compared with every R2 contradiction and evidence gap, all nineteen R3 acceptance criteria,
  the six Issue #44 fixtures, the relation table, the twelve stable rules, completion semantics, V1
  coexistence, help navigation, and trust boundaries.
- The review reasoning audit completed with `fatal=0`, `error=0`, and `warning=0`.

## Result summary

- The four findings that caused R2 revision are addressed in R3: follow-up is representable,
  impact obligations use defined target assessments, phenomena bind to same-case scopes, and endpoint
  sets are deterministic.
- Two new high contradictions with the authoritative Issue #44 outcome remain.
- Two medium evidence gaps remain unresolved; neither is silently promoted into requirement text.
- The report is `completed`, not `not-reviewable`, because the snapshots and governing authority are
  exact and the findings are decidable.
- Recommendation for Step 4: `REVISE`. R3 should not be accepted with the two contradictions below.

## Contradictions

### CR-RCA3-001 — high — downstream artifact dependency/propagation is not representable

Issue #44 requires the RCA model to distinguish dependency or propagation **between downstream
artifacts**. R3 can propagate `phenomenon` or `impact` into another `impact`, and can attach an impact
to an opaque `impact_target`, but its closed relation table defines no relation from one
`impact_target` to another. A chain such as requirement to design to plan to implementation therefore
cannot be declared or queried as artifact-to-artifact dependency/propagation under this profile.

This is a requirement-model contradiction, not a missing implementation or test. A new requirement
revision must define the target-to-target relation and its direction, endpoints, cycle behavior, and
audit/query obligations, or explicitly reconcile a different representation with Issue #44.

### CR-RCA3-002 — high — unverified implemented action can evade the completion rejection

Issue #44 fixture 6 requires rejection when an implemented countermeasure is treated as effective
**or complete** without verification. R3 rule `RCA-R1-010` rejects only an action declared
`effective` without a passed verification. The completion section says that “required verification
paths” exist, but does not define which implemented actions require them or assign a stable finding
when a `settled` case contains only an `implemented`, unverified action.

Consequently such a case can avoid `RCA-R1-010`, and no other R3 stable rule explicitly rejects its
completion. The producing phase is the R3 requirement model. A new revision must bind settled-case
completion to exact action/verification obligations and stable-rule coverage.

## Evidence gaps and unresolved unknowns

### EG-RCA3-001 — medium — correlated closed-operator expressibility remains unproven

R3 requires an impact target to be in every scope reached through each originating phenomenon and
requires its current assessment to agree with impact actuality. Generic V2 provides `path_required`,
relation, property, count, and boolean operators, but leaves the exact profile schema downstream. It
has not yet been demonstrated that those closed operators can bind and compare the same target across
both sides of the multi-path scope/impact/assessment relationship without an added operator or hidden
code.

This is not yet an impossibility proof and therefore is an evidence gap rather than a contradiction.
The next revision or review needs a minimal declarative profile fragment showing the exact binding.

### EG-RCA3-002 — medium — successor-action identity is not fixed

`requires_followup` points from a failed or inconclusive verification to an allowed action kind, but
R3 does not state whether that target must be a distinct action node from the action evaluated by
`verifies`, nor how “successor” ordering is represented. Pointing both relations to the same action
would satisfy the written endpoint and rule checks while leaving the intended follow-up semantics
uncertain.

The requirement should either define the distinctness/ordering rule or explicitly state that rework
of the same action node is permitted and how its lifecycle remains lossless.

## Optional or future candidates

- After requirement acceptance, synchronize the PERT implementation and surface tasks with the final
  target-dependency, verification-completion, and exhaustive help obligations. This is planning work,
  not an added acceptance blocker for the reviewed snapshot.
- Namespace-aware queries, remotely fetched catalogs, and help-driven profile installation remain
  future candidates and are not blockers.

## Out of scope confirmed

R3 does not authorize V1 cutover, namespace or ACL work, truth judgment, implicit target/evidence
fetching, thought-store migration execution, design, implementation, commit, push, release,
publication, deployment, Issue mutation, or operational incident action. No review finding promotes
those effects into scope.

## Step 4 decision

The owner must choose exactly one route for the unchanged R3 snapshot:

- `REVISE`: return to Step 1 and create new candidate and review-input revisions;
- `REREVIEW`: keep the candidate digest unchanged, add or change review questions, and repeat Step 3;
  or
- `ACCEPT`: accept the exact candidate bytes despite the reported findings.

This report recommends `REVISE` because CR-RCA3-001 and CR-RCA3-002 are contradictions in the
requirement model, not downstream verification gaps. Review completion itself authorizes no later
artifact or external effect.
