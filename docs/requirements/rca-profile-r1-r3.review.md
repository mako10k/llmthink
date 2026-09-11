# Independent-review input: Impact-Aware RCA Profile R1, Requirement Revision R3

Status: proposed Step 3 input; Step 2 owner route not yet selected

Candidate: `docs/requirements/rca-profile-r1-r3.md`

Candidate digest: `sha256:6f3817a9285d7cbea6b7981977e8765a5a31060205f91fa15d464b008c132312`

Japanese review support: `docs/requirements/rca-profile-r1-r3.ja.md`

Japanese translation digest: `sha256:4c98a592c5f72f8d9bfc34dca3650a51c942f2427ad434247673080e8e9a2613`

## Review authority and dependency

Review only the exact candidate bytes above. Do not edit the candidate or turn review findings into
new requirements. The candidate depends on the accepted Generic Profile and Audit Contract V2 R2
snapshot `sha256:89f20a526d4bf67df4c9576b529d3e8b13a617218935d12551fc2e3f0b9e8cc8`.
It cannot be accepted if that predecessor changes without reconciliation or is found incapable of
expressing the RCA constraints.

Classify each material finding as a contradiction, evidence gap/unresolved unknown, optional/future
candidate, or out of scope. Severity does not change classification. Review does not accept the RCA
requirement or authorize design, implementation, migration, external action, release, or deployment.

## Revision context and source provenance

The owner accepted Generic V2 R2 and returned the RCA R2 candidate for revision after independent
review. R3 is a new Step 1 snapshot; it does not inherit R2 review status. Check whether R3 resolves
the four R2 findings without introducing RCA-specific parser syntax, executable profile behavior, or
an unstated expansion of Generic V2:

- represent failed or inconclusive verification follow-up with `requires_followup`;
- express impact obligations only through impact-to-target and current-assessment structure;
- bind each phenomenon to exactly one same-case impact scope with `covered_by`; and
- replace relation endpoint category shorthand with exact node-kind sets.

The candidate freezes Issue #44's current body, uses Issues #10/#25 for the generic profile route,
uses Issue #43 only for audit-boundary evidence, binds the accepted Generic V2 predecessor, and cites
the R2 review report as revision evidence rather than normative text.

## In scope

- distinct RCA case, phenomenon, impact-universe, target, assessment, impact, cause, action,
  verification, evidence, and pending structures;
- exactly one same-case `covered_by` scope for each phenomenon;
- explicit affected/suspect/unaffected/unknown target assessment;
- exact impact-to-in-scope-target and assessment consistency;
- realized versus credible impact;
- root, contributing, trigger, and escape-cause separation;
- corrective action, containment, recovery, recurrence prevention, and verification separation;
- representable failed/inconclusive verification follow-up through `tracks` or `requires_followup`;
- exact endpoint kinds for every relation;
- twelve stable structural rules with target spans and discipline severity;
- six executable positive/negative fixtures and cross-surface conformance;
- profile-registry-derived RCA help covering the workflow, structural model, rules, fixtures,
  migration, and limitations;
- V1 coexistence and fail-closed, non-inferential migration; and
- no implicit I/O, semantic truth judgment, or action authority.

## Out of scope

- deciding factual cause, impact, classification, or effectiveness;
- automatically discovering or fetching the real impact universe;
- inferring RCA roles or relations from prose or embeddings;
- RCA-specific parser productions or executable profile plugins;
- V1 behavior changes, namespace/cross-thought work, operational incident workflow, external action,
  release, publication, deployment, or Issue mutation.

## Acceptance focus

Review the complete nineteen-item acceptance section and establish in particular whether:

1. the accepted generic closed operators can express all twelve RCA rules without hidden code;
2. each phenomenon has exactly one same-case scope and every impact-to-target claim is checked against
   that scope and the target's current assessment;
3. realized and credible impacts have coherent permitted assessments, including the reverse
   obligation from current `affected` assessment to realized impact;
4. source cause, contributing condition, trigger, and escape cause cannot substitute for each other;
5. root-cause correction cannot discharge containment/recovery obligations for affected or suspect
   targets with applied impacts;
6. failed or inconclusive verification has a representable successor obligation through exact
   `tracks` or `requires_followup` endpoints;
7. all relation endpoint sets and missing-obligation target rules are mechanically decidable;
8. the six fixtures isolate their intended stable rules without unrelated diagnostic noise;
9. target references remain opaque and cannot grant I/O or repository/runtime authority;
10. every RCA help route and alias derives from the generic profile registry without RCA-specific
    parser or dispatch code;
11. each displayed example parses and audits under the exact profile reference with only its
    declared stable findings, while invalid routes recover offline; and
12. V1 and unrelated V2 documents remain unchanged.

## Known unknowns

- Exact profile JSON and final message text remain downstream artifacts, while rule IDs, conditions,
  severities, targets, and message identities are fixed by this candidate.
- The actual real-world impact universe remains author-declared.
- Profile publication, package placement, operational integration, and release remain undecided.
- The exact CLI argument ordering is a Generic V2 downstream design choice.
- R3 has not yet received independent review or owner acceptance.

## Review questions

1. Does R3 resolve each R2 contradiction and evidence gap without adding an unsupported requirement?
2. Can `rca-impact@1.0.0` represent every Issue #44 element without adding parser syntax?
3. Does `covered_by` unambiguously associate each phenomenon with exactly one same-case impact
   universe?
4. Are `impact_scope`, `impact_target`, `impact_assessment`, and `impact` sufficiently distinct, and
   are all forward and reverse consistency obligations explicit?
5. Are all relation endpoint kinds exact enough for declarative validation and query?
6. Can failed/inconclusive verification always represent its unresolved obligation without pretending
   that a successor action is effective?
7. Do `RCA-R1-001` through `RCA-R1-012` detect the intended structural gaps without asserting truth?
8. Is the structural completion contract strict enough to block partial/unknown scope, unresolved
   assessments, missing containment/recovery, and unverified effectiveness?
9. Does migration avoid every unsupported inference from V1 prose?
10. Are all required findings targetable to the smallest source-backed span?
11. Does any clause silently expand Generic V2, modify V1, or authorize an external action?
12. Do the help route and example criteria preserve V1 help while proving complete, deterministic,
    offline navigation on every required surface?

## Route after independent review

The Step 2 owner must select one route before this input is used:

- `REVIEW_THEN_REVISE`: review the unchanged snapshot, then return to Step 1; or
- `REVIEW_THEN_DECIDE`: review the unchanged snapshot, then present it and the report for Step 4.

The owner may instead choose `REVISE` and skip independent review, or `REVIEW` without added owner
questions. No route is inferred by this document.
