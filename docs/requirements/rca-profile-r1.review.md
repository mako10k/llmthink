# Independent-review input: Impact-Aware RCA Profile R1

Status: proposed Step 3 input; Step 2 owner route not yet selected

Candidate: `docs/requirements/rca-profile-r1.md`

Candidate digest: `sha256:54e4d4532d11140e112fcd5e8855a32ffbc0f9b74d244eae10b2f94a2d199edc`

Japanese review support: `docs/requirements/rca-profile-r1.ja.md`

Japanese translation digest: `sha256:6f1e50fd9e79b7bac37c785abc03d74434cd62468169a05ef05875c417277c05`

## Review authority and dependency

Review only the exact candidate bytes above. Do not edit the candidate or turn review findings into
new requirements. The candidate depends on Generic Profile and Audit Contract V2 R1 candidate
`sha256:9628bce445371304b1fd23e9521b1d53e8eb5f445dfdff15f601bf7225c20c54`.
It cannot be accepted if that predecessor is unaccepted, changed without reconciliation, or found
incapable of expressing the RCA constraints.

Classify each material finding as a contradiction, evidence gap/unresolved unknown, optional/future
candidate, or out of scope. Severity does not change classification. Review does not accept either
requirement or authorize design, implementation, migration, external action, release, or deployment.

## Source provenance and selected combination

The candidate freezes Issue #44's current body, uses Issues #10/#25 for the generic profile route,
uses Issue #43 only for audit-boundary evidence, and binds the exact Generic V2 predecessor. Review
whether the three alternatives are represented faithfully:

- no RCA-specific parser syntax;
- generic V2 primitives plus `rca-impact@1.0.0`; and
- RCA-specific audit expressed only through declarative closed profile constraints.

## In scope

- distinct RCA case, phenomenon, impact-universe, target, assessment, impact, cause, action,
  verification, evidence, and pending structures;
- explicit affected/suspect/unaffected/unknown target assessment;
- scope completeness separate from the number of listed impacts;
- realized versus credible impact;
- root, contributing, trigger, and escape-cause separation;
- corrective action, containment, recovery, recurrence prevention, and verification separation;
- twelve stable structural rules with target spans and discipline severity;
- six executable positive/negative fixtures and cross-surface conformance;
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

Review the complete fourteen-item acceptance section and establish in particular whether:

1. the generic closed operators can express all twelve RCA rules without hidden code;
2. the scope/target/assessment model can distinguish universe completeness from assessment outcome;
3. source cause, contributing condition, trigger, and escape cause cannot substitute for each other;
4. root-cause correction cannot discharge containment/recovery obligations for propagated effects;
5. implemented/effective action and passed/failed/inconclusive verification transitions are coherent;
6. the six fixtures isolate their intended stable rules without unrelated diagnostic noise;
7. target references remain opaque and cannot grant I/O or repository/runtime authority; and
8. V1 and unrelated V2 documents remain unchanged.

## Known unknowns

- The Generic V2 predecessor is a candidate, not yet accepted.
- Exact profile JSON and final message text remain downstream artifacts, while rule IDs, conditions,
  severities, targets, and message identities are fixed by this candidate.
- The actual real-world impact universe remains author-declared.
- Profile publication, package placement, operational integration, and release remain undecided.

## Review questions

1. Can `rca-impact@1.0.0` represent every Issue #44 element without adding parser syntax?
2. Are `impact_scope`, `impact_target`, `impact_assessment`, and `impact` sufficiently distinct to
   prevent a short impact list from masquerading as a complete universe?
3. Do relation directions support lossless causal, propagation, support, action, and verification
   queries?
4. Do `RCA-R1-001` through `RCA-R1-012` detect the intended structural gaps without asserting truth?
5. Is the structural completion contract strict enough to block partial/unknown scope, unresolved
   assessments, missing containment/recovery, and unverified effectiveness?
6. Does migration avoid every unsupported inference from V1 prose?
7. Are all required findings targetable to the smallest source-backed span?
8. Does any clause silently expand Generic V2, modify V1, or authorize an external action?

## Route after independent review

The Step 2 owner must select one route before this input is used:

- `REVIEW_THEN_REVISE`: review the unchanged snapshot, then return to Step 1; or
- `REVIEW_THEN_DECIDE`: review the unchanged snapshot, then present it and the report for Step 4.

The owner may instead choose `REVISE` and skip independent review, or `REVIEW` without added owner
questions. No route is inferred by this document.
