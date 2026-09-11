# Independent Review Report: Impact-Aware RCA Profile R1 Requirement R4

Status: completed; Step 3 report

Review date: 2026-09-11

First-owner route: `REVIEW_THEN_DECIDE`

Owner-added questions: none

Reviewer: Codex independent-review pass with candidate-authoring state held read-only

## Reviewed snapshots

| Subject                                 | Path                                             | SHA-256                                                            |
| --------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| RCA Profile R1 requirement R4 candidate | `docs/requirements/rca-profile-r1-r4.md`         | `890bf0c0cd1b704e7c2822299e46ce39750b7751e1132050818be0ff43ebc90f` |
| RCA R4 review input                     | `docs/requirements/rca-profile-r1-r4.review.md`  | `7bdc04b62714480944d81ca978d20ded209620d9e80687c6594a1091703b6ea6` |
| Accepted Generic V2 R2 requirement      | `docs/requirements/generic-profile-v2-r2.md`     | `89f20a526d4bf67df4c9576b529d3e8b13a617218935d12551fc2e3f0b9e8cc8` |
| Prior R3 independent review             | `docs/requirements/rca-r3-independent-review.md` | `1369e12e0c694ef45dff5bb3be5c3201fa60dde6a142db7b670fa39f65dacc4f` |

The candidate and review-input digests were re-read before and after review. Candidate bytes were
not edited.

## Evidence checked

- Live GitHub Issue #44 body digest remained
  `e8998c62c2c8ff7de9ab3725f9ecd62b301b63249626baff8927815a93f76d4b`, matching the frozen source.
- Generic V2 R2 remains the accepted exact predecessor and exposes only the twelve closed constraint
  operators listed in its section 7.
- R4 was compared with both R3 contradictions, both R3 evidence gaps, all twenty-two R4 capability
  acceptance criteria, the eight fixtures, thirteen stable rules, completion semantics, V1
  coexistence, help navigation, migration, and trust boundaries.
- The review reasoning audit completed with `fatal=0`, `error=0`, and `warning=0`.

## Result summary

- R4 repairs both R3 contradictions: target-to-target dependency and propagation are explicit, and a
  settled case rejects actions used by its correction, containment, recovery, or prevention paths
  when they are non-effective or lack passed verification.
- R4 also fixes successor identity and ordering as a distinct node plus logical relation order.
- Two new high contradictions remain in the completion model.
- One medium evidence gap remains deliberately unresolved behind the declared capability proof gate.
- The report is `completed`, not `not-reviewable`, because the exact snapshots and source authority
  were available and the contradictions are decidable from the written contract.
- Recommendation for Step 4: `REVISE`. R4 should not be accepted with the two completion loopholes
  below.

## Contradictions

### CR-RCA4-001 — high — an unresolved follow-up action can coexist with a settled case

Issue #44 requires post-action verification and rejects treating an implemented countermeasure as
effective or complete without verification. R4 section 6.9 permits a failed or inconclusive
verification to discharge its immediate structural obligation through a distinct
`requires_followup` action instead of a pending tracker. However, it does not require that successor
action to be linked by `corrects`, `contains`, `recovers`, or `prevents`, or to become effective and
pass verification before the case is settled.

Rules `RCA-R1-009` and `RCA-R1-010` do not close this path: rule 009 sees no pending node, and rule
010 covers only actions used by the four action relations. Rule 012 checks only that the follow-up
exists and is distinct. Consequently, a case may contain a failed verification and only a proposed,
unverified successor action, yet avoid every stated settled-case rejection.

This is a requirement-model contradiction produced in R4's action/completion contract, not a missing
test. A new requirement revision must make unresolved successor work incompatible with settled
completion and assign stable-rule and fixture coverage, without the reviewer selecting the repair.

### CR-RCA4-002 — high — a complete target-relation chain can remain outside every impact scope

Issue #44 requires an explicit impact universe and assessment of its targets, including downstream
artifact dependency and propagation. R4 section 5.7 closes scope membership only when either
relation endpoint is already `in_scope`: it then requires the other endpoint in that same scope. If
both endpoints of a `depends_on` or `propagates_to_target` relation are outside every scope, the
condition is vacuously satisfied.

Rule `RCA-R1-013` has the same gap because it checks membership in every scope containing either
endpoint; there is no such scope in this case. Completion then assesses only in-scope targets. A
same-case target chain can therefore be declared, left wholly unassessed outside the author-declared
universe, and coexist with `settled`.

This contradicts the impact-universe outcome for declared downstream artifacts. The producing phase
is R4's scope-membership requirement. A new revision must establish the non-vacuous scope obligation
and stable finding for declared target relations, without treating automatic discovery of undeclared
real-world targets as required.

## Evidence gaps and unresolved unknowns

### EG-RCA4-001 — medium — correlated closed-operator expressibility is still unproven

Generic V2 R2 names twelve closed operators and permits selectors by kind, relation, property, state,
or containment, combined with `all`, `any`, and `not`. It does not yet provide an exact profile schema
or demonstrated variable-binding semantics. R4 requires shared-identity comparison across scope,
impact, assessment, target-chain, and verification/follow-up paths, including distinct-node checks.

R4 correctly does not claim that this is already expressible. Sections 7.1, 13, and 15 make an exact
minimal profile fragment a capability-acceptance gate and return failure to Generic contract
reconciliation rather than authorizing hidden code or an undeclared operator. The evidence gap
therefore remains material but is not itself a contradiction in R4. Requirement acceptance would
accept this explicit uncertainty and return path; it would not prove implementation feasibility.

## Optional or future candidates

- After an exact RCA requirement is accepted, reconcile `plans/rca-profile-v2.pert` with the final
  rule count, fixture count, target relations, proof gate, and help obligations. The currently stale
  six-fixture wording is planning work, not a contradiction in this reviewed requirement snapshot.
- Namespace-aware queries, fetched target catalogs, and operational incident integrations remain
  future candidates and are not acceptance blockers.

## Out of scope confirmed

R4 does not authorize factual cause or impact judgment, implicit target discovery or fetching,
profile-supplied code, V1 cutover, namespace or ACL work, thought-store mutation, ADR or design work,
PERT mutation, implementation, commit, push, release, publication, deployment, Issue mutation, or
operational incident action. No review finding promotes those effects into scope.

## Step 4 decision

The owner must choose exactly one route for the unchanged R4 snapshot:

- `REVISE`: return to Step 1 and create new candidate and review-input revisions;
- `REREVIEW`: keep the candidate digest unchanged, add or change review questions, and repeat Step 3;
  or
- `ACCEPT`: accept the exact candidate bytes despite the reported findings.

This report recommends `REVISE` because CR-RCA4-001 and CR-RCA4-002 permit structurally settled
cases with unresolved declared work or unassessed declared downstream targets. Review completion
itself authorizes no later artifact or external effect.
