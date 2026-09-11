# Independent-review input: Impact-Aware RCA Profile R1, Requirement Revision R4

Status: approved Step 3 input

First-owner route: `REVIEW_THEN_DECIDE`

Owner-added questions: none

Candidate: `docs/requirements/rca-profile-r1-r4.md`

Candidate digest: `sha256:890bf0c0cd1b704e7c2822299e46ce39750b7751e1132050818be0ff43ebc90f`

Japanese review support: `docs/requirements/rca-profile-r1-r4.ja.md`

Japanese translation digest: `sha256:6f1f653cf18dcf2cfb511a4d8030ef45370d10c57062aef3ebaf64800dd4a47e`

## Review authority and dependency

Review only the exact candidate bytes above. Do not edit the candidate or turn review findings into
new requirements. The candidate depends on the accepted Generic Profile and Audit Contract V2 R2
snapshot `sha256:89f20a526d4bf67df4c9576b529d3e8b13a617218935d12551fc2e3f0b9e8cc8`.
It cannot be accepted if that predecessor changes without reconciliation or if R4 silently requires
a constraint operator outside its accepted closed set.

Classify each material finding as a contradiction, evidence gap/unresolved unknown, optional/future
candidate, or out of scope. Severity does not change classification. Review does not accept the RCA
requirement or authorize design, implementation, migration, external action, release, or deployment.

## Revision context and source provenance

The owner returned R3 for revision after a completed independent review. R4 is a new Step 1 snapshot
and does not inherit R3 review status. Check whether R4 resolves the R3 findings without changing the
accepted Generic contract or weakening Issue #44:

- represent downstream artifact dependency and propagation with exact target-to-target relations;
- reject settled completion when required actions remain non-effective or unverified;
- define follow-up action distinctness and logical ordering; and
- preserve correlated closed-operator evaluation as an explicit capability proof gate.

The candidate freezes Issue #44's current body, uses Issues #10/#25 for the generic profile route,
uses Issue #43 only for audit-boundary evidence, binds the accepted Generic V2 predecessor, and cites
R2/R3 review reports only as non-normative revision evidence.

## In scope

- the complete R3 RCA structural model and its prior four repairs;
- distinct `depends_on` and `propagates_to_target` directions between same-case impact targets;
- scope closure and per-relation acyclicity for downstream target chains;
- settled-case rejection for current pending nodes and non-effective or unverified required
  actions;
- distinct-node follow-up after failed/inconclusive verification, with no inferred wall-clock time;
- thirteen stable structural rules with exact targets, spans, and discipline severity;
- eight executable fixtures and cross-surface conformance;
- an exact minimal profile-fragment proof that correlated rules use only accepted closed operators;
- profile-registry-derived RCA help, V1 coexistence, fail-closed migration, and trust boundaries; and
- no implicit I/O, semantic truth judgment, or action authority.

## Out of scope

- deciding factual cause, impact, classification, propagation, or effectiveness;
- automatically discovering or fetching the real impact universe;
- inferring RCA roles, relations, dependency, propagation, or time from prose or embeddings;
- a new Generic V2 operator, RCA-specific parser production, or executable profile plugin;
- V1 behavior changes, namespace/cross-thought work, operational incident workflow, external action,
  release, publication, deployment, or Issue mutation.

## Acceptance focus

Review the complete twenty-two-item capability acceptance section and establish in particular
whether:

1. both downstream target relations have unambiguous opposite directions, same-case endpoints,
   per-scope closure, per-relation cycle rules, and ordinary Generic DSLQL traversal;
2. a settled case cannot contain a current pending node or use any non-effective or unverified
   action through `corrects`, `contains`, `recovers`, or `prevents`;
3. failed/inconclusive verification requires pending or a distinct follow-up node, and the relation
   alone supplies logical succession without inferred time;
4. each of the thirteen stable rules maps to the accepted closed operators and has a smallest
   source-backed target;
5. the minimal profile-fragment proof is a capability gate and does not silently add a Generic
   operator or make hidden code acceptable;
6. all eight fixtures isolate the intended findings without unrelated diagnostic noise;
7. Issue #44's downstream-artifact and unverified-completion examples are now losslessly covered;
8. target references remain opaque and cannot grant I/O or repository/runtime authority;
9. all RCA help routes, aliases, stable-rule details, and examples remain registry-derived,
   deterministic, and offline; and
10. V1 and unrelated V2 documents remain unchanged.

## Known unknowns

- Exact profile JSON and final message text remain downstream artifacts.
- The minimal closed-operator profile fragment and executable fixtures do not yet exist; R4 makes
  them capability-acceptance evidence rather than assuming success.
- The actual real-world impact universe remains author-declared.
- Profile publication, package placement, operational integration, and release remain undecided.
- The exact CLI argument ordering remains a Generic V2 downstream design choice.
- R4 has not yet received independent review or owner acceptance.

## Review questions

1. Does R4 address both R3 contradictions and both evidence gaps without expanding Generic V2?
2. Can downstream requirement/design/plan/implementation chains be represented and queried in both
   dependency and propagation directions without conflating them?
3. Does scope closure prevent a declared downstream relation from hiding an endpoint outside the
   assessed universe?
4. Does `RCA-R1-010` reject both effective-without-verification and settled-with-implemented-only
   action cases?
5. Do `RCA-R1-009` and the completion contract consistently prevent unresolved pending obligations
   from appearing settled?
6. Is each follow-up action structurally distinct from every action evaluated by the failed or
   inconclusive verification, with no unsupported temporal claim?
7. Are all thirteen stable rules plausibly expressible with the accepted closed operators, and does
   the proof-failure path correctly return to Generic contract reconciliation?
8. Do the eight fixtures cover the new relations and completion rules while preserving the original
   six Issue #44 examples?
9. Does any clause silently modify V1, authorize truth judgment or I/O, or make an external effect part
   of this requirement review?
10. Do the help and migration criteria remain complete, deterministic, offline, and non-inferential?

## Route after independent review

The owner selected `REVIEW_THEN_DECIDE` at Step 2. Review the unchanged snapshot, then present it and
the completed or not-reviewable report for the Step 4 owner decision. This route does not predetermine
`ACCEPT`, `REVISE`, or `REREVIEW`.
