# Independent Review Report: Generic V2 R2 and RCA Profile R1 Requirement R2

Status: completed; Step 3 report

Review date: 2026-09-11

First-owner route: `REVIEW_THEN_DECIDE`

Owner-added questions: none

Reviewer: Codex independent-review pass with candidate-authoring state held read-only

## Reviewed snapshots

| Subject                                    | Path                                                | SHA-256                                                            |
| ------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------ |
| Generic V2 R2 candidate                    | `docs/requirements/generic-profile-v2-r2.md`        | `89f20a526d4bf67df4c9576b529d3e8b13a617218935d12551fc2e3f0b9e8cc8` |
| Generic V2 R2 review input                 | `docs/requirements/generic-profile-v2-r2.review.md` | `863a06db1a9b9aacb56433f1adcad865d73a0def2e7630fdafc08603ca517df0` |
| RCA Profile R1 requirement R2 candidate    | `docs/requirements/rca-profile-r1-r2.md`            | `23d2b0b7b765112dd309b327dacce65119660c845ef2c8e422f04b968ef23d61` |
| RCA Profile R1 requirement R2 review input | `docs/requirements/rca-profile-r1-r2.review.md`     | `7c06a1f558d31a0588f5c971581285c1346cc42285f50de881399498a437dc1d` |

The candidate digests were re-read before and after review. Candidate bytes were not edited.

## Evidence checked

- Live GitHub Issue body digests for #10, #25, #43, and #44 match the frozen candidate values.
- Local digests for `docs/specs/requirements.md`, ADR-0018, ADR-0019, ADR-0021, ADR-0023,
  Issue #43 reconciliation, and `plans/rca-profile-v2.pert` match the candidate snapshot table.
- The later owner direction keeps V1 as the default while allowing explicitly selected V2 work.
- Existing V1 help demonstrates that a shared structured graph with index, quick, detail, related
  topics, next requests, aliases, and examples is feasible. This is feasibility evidence, not
  requirement authority.
- The review reasoning audit completed with `fatal=0`, `error=0`, and `warning=0`.

## Result summary

- Generic V2 R2: no candidate contradiction found. Its unknown profile schema, exact CLI route
  syntax, and registry representation remain declared downstream decisions.
- RCA Profile R1 requirement R2: two candidate contradictions and two unresolved evidence gaps were
  found.
- Review input: one non-blocking identity inconsistency was found. Exact paths and digests remained
  unambiguous, so the review was completed rather than marked not-reviewable.
- Recommendation for Step 4: `ACCEPT` Generic V2 R2 and `REVISE` RCA Profile R1 requirement R2.
  Accepting Generic V2 alone does not make the dependent RCA candidate acceptable.

## Contradictions

### CR-RCA-001 — high — successor action cannot be represented

RCA section 6.8 and stable rule `RCA-R1-012` permit a failed or inconclusive verification to be
linked to a `pending` item **or a successor action**. The closed RCA relation table defines `tracks`
from `pending` to an RCA node, but defines no relation from a verification or prior action to a
successor action. Therefore one normative recovery alternative cannot be represented or evaluated
under the candidate's own allowed relation contract.

This originates in the requirement model, not in missing implementation or tests. A new requirement
revision must either define the successor-action structure or remove that alternative.

### CR-RCA-002 — high — unresolved credible-impact obligation is not decidable

RCA section 6.4 requires each **unresolved credible impact** to have containment, recovery, or a
pending tracker. The model defines `actuality=credible`, but does not define how an impact becomes
resolved or unresolved. Stable rule `RCA-R1-008` targets affected or suspect downstream targets and
does not cover an independently declared credible impact. Consequently the completion contract can
leave the obligation unevaluated while still relying on the fixed twelve-rule set.

This also originates in the requirement model. A new revision must define the resolution state and
stable-rule coverage, or restate the obligation in terms of already defined target assessments.

### CR-INPUT-001 — low — review input retains R1 labels

The Generic R2 review input still says “R1 blocker”, “R1 completion”, and “R1 scope” in three places.
It also has duplicated conjunction punctuation around the newly added help-navigation acceptance
focus; the RCA review input has a missing separator between focus items 8 and 9. These statements
contradict the R2 review identity but do not change the exact candidate path, digest, or substantive
questions. They should be corrected when Step 1 is revised; they did not prevent this review.

## Evidence gaps and unresolved unknowns

### EG-RCA-001 — medium — per-phenomenon scope association is ambiguous

The relation model links case to scope, scope to target, phenomenon or impact to impact, and impact to
target. The completion contract requires every phenomenon to have a documented complete impact
scope, but it does not define the association when a case has multiple phenomena or multiple scopes.
The profile schema could choose a rule, but the reviewed requirement does not yet state which rule is
authoritative.

### EG-RCA-002 — medium — endpoint categories are not exact kind sets

Several normative relation endpoints use category words such as `assessment`, `cause`, `action`,
“root or contributing cause”, and “any action kind” rather than the exact node-kind identifiers.
Generic V2 requires profiles to declare endpoint-kind contracts. The intended expansions are
inferable, but not fixed by the candidate and could diverge between profile data, help, and tests.

### EG-GENERIC-001 — medium — closed-operator sufficiency remains unproven

The Generic candidate defines the acceptance test for adding profiles without parser or Core IR
changes, but the exact profile schema and `reasoning@2.0.0` bytes do not yet exist. This is an
acknowledged implementation evidence gap, not a contradiction in the Generic requirement. The RCA
candidate's dependency still requires proof that the closed operators can express its corrected
rules before RCA acceptance or implementation.

### EG-HELP-001 — low — concrete route grammar remains downstream

Both candidates intentionally leave exact CLI argument order and physical registry layout to design.
The observable help contract is testable, so this is not a requirement contradiction. The later
design must still choose one explicit route grammar without weakening V1 default preservation,
offline resolution, canonical identity, or exhaustive route/example conformance.

## Optional or future candidates

- After requirement acceptance, update the PERT task descriptions so the implementation and surface
  synchronization slices explicitly carry the exhaustive help-route, alias, invalid-route, offline,
  and example-validation obligations. This is planning synchronization, not an additional acceptance
  criterion for the reviewed requirement.
- Namespace-aware help, remotely fetched catalogs, and help-driven profile installation remain future
  candidates and are not blockers.

## Out of scope confirmed

The candidates do not authorize V1 cutover, namespace or ACL work, truth judgment, implicit target or
evidence fetching, thought-store migration execution, release, publication, deployment, Issue
mutation, or operational incident actions. No review finding promotes those items into scope.

## Step 4 decision

The owner must choose exactly one route for each unchanged snapshot:

- `REVISE`: return to Step 1 and create new candidate and review-input revisions;
- `REREVIEW`: keep candidate digests unchanged, change or add review questions, and repeat Step 3; or
- `ACCEPT`: accept the exact candidate bytes despite the findings.

This report recommends `ACCEPT` for Generic V2 R2 because it has no candidate contradiction, and
`REVISE` for RCA Profile R1 requirement R2 because CR-RCA-001 and CR-RCA-002 are requirement-model
defects rather than missing downstream evidence. Generic acceptance would still authorize no design,
implementation, migration, commit, push, release, or deployment.
