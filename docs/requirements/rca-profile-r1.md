# Impact-Aware RCA Profile R1 — Requirement Candidate R1

Status: Step 1 candidate, self-reviewed, not accepted

Requirement revision: R1

External profile name: Impact-Aware RCA Profile R1

Proposed profile reference: `rca-impact@1.0.0`

Candidate date: 2026-09-11

Decision owner: llmthink decision owner

## 1. Purpose and dependency

This candidate defines impact-aware root-cause analysis as one specialized profile over the generic
V2 node/link/operation/query model. It must make omissions and category substitutions structurally
visible without asking LLMThink to decide whether a claimed cause, impact, or remedy is true.

This candidate depends on the exact Generic Profile and Audit Contract V2 R1 candidate at
`sha256:9628bce445371304b1fd23e9521b1d53e8eb5f445dfdff15f601bf7225c20c54`.
It may be reviewed in parallel, but it MUST NOT be accepted or implemented unless that exact generic
contract, or an explicitly reconciled successor, is accepted first.

## 2. Authority and source snapshot

| Input                       | Snapshot                                                                                           | Disposition in this candidate                               |
| --------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| GitHub Issue #44            | Updated 2026-09-11; body `sha256:e8998c62c2c8ff7de9ab3725f9ecd62b301b63249626baff8927815a93f76d4b` | Primary RCA outcome and acceptance authority candidate      |
| GitHub Issue #10            | Updated 2026-05-08; body `sha256:08d393d8b62676d0426e94c54edecfeb6501c7d8b12d6c96e2851264b5f32f71` | Use profiles before use-case-specific parser syntax         |
| GitHub Issue #25            | Updated 2026-08-19; body `sha256:e1d77d8b4ac58964ace1303b32299712ea93c5ed2e29ec40a10797bdea5f19df` | Generic V2 profile mechanism; not independent RCA authority |
| GitHub Issue #43            | Updated 2026-09-08; body `sha256:5fec6a52fad9b96730e7cc264c5a0175297f21dc4f0d7f8c4e695b1153224076` | Pure, fail-closed, evidence-grounded V1 audit baseline      |
| Generic V2 R1 candidate     | `sha256:9628bce445371304b1fd23e9521b1d53e8eb5f445dfdff15f601bf7225c20c54`                          | Required generic contract predecessor; still unaccepted     |
| `plans/rca-profile-v2.pert` | `sha256:a78302cb3c8e08639029c8b922d0af14f124d91ab1f88a537840e6b67b05caa0`                          | Delivery dependency and review ordering only                |

GitHub body digests use the exact UTF-8 body without a CLI-added trailing newline.

## 3. Selected combination of the Issue #44 alternatives

R1 proposes this combination for owner acceptance:

1. **Use-case-specific syntax: not selected.** RCA does not add parser productions. This avoids
   multiplying parser, IR, DSLQL, LSP, preview, and help branches.
2. **Generic primitives plus a versioned profile: selected.** RCA concepts are profile-defined kinds,
   properties, relations, containment, and lifecycle values over Generic V2.
3. **Use-case-specific audit: selected only as declarative profile constraints.** RCA rules use the
   generic closed constraint operators. The profile cannot install code or semantic inference.

This selection applies only to the RCA R1 candidate. It does not accept Generic V2, implement the
profile, or establish a rule for every future use case.

## 4. RCA structural model

One `rca_case` container owns the analysis. R1 defines these node kinds:

- `rca_case`
- `phenomenon`
- `impact_scope`
- `impact_target`
- `impact_assessment`
- `impact`
- `root_cause`
- `contributing_cause`
- `trigger`
- `escape_cause`
- `corrective_action`
- `containment`
- `recovery`
- `recurrence_prevention`
- `verification`
- inherited `evidence`
- inherited `pending`

The distinctions are normative. In particular, `escape_cause` cannot satisfy a requirement for
`root_cause`; `corrective_action` cannot satisfy `containment` or `recovery`; and implementation of
an action cannot satisfy `verification` or effectiveness.

### 4.1 Required properties

- `rca_case`: generic lifecycle state; `settled` declares structural completion.
- `impact_scope`: `completeness` in `complete | partial | unknown`.
- `impact_target`: `target_type` in `file | commit | requirement | plan | implementation | test |
report | runtime | remote | deployment | other`, plus non-empty opaque `target_ref`.
- `impact_assessment`: `classification` in `affected | suspect | unaffected | unknown`.
- `impact`: `actuality` in `realized | credible`.
- `corrective_action`, `containment`, `recovery`, `recurrence_prevention`: `action_state` in
  `proposed | implemented | effective`.
- `verification`: `result` in `passed | failed | inconclusive`.

`target_ref` is an identifier recorded by the author. Core MUST NOT dereference it or infer authority,
existence, content, or current state from its type.

### 4.2 Relations and direction

R1 defines these directed relations:

| Relation             | From                     | To                                                             | Meaning asserted by the author                   |
| -------------------- | ------------------------ | -------------------------------------------------------------- | ------------------------------------------------ |
| `documents_scope`    | `rca_case`               | `impact_scope`                                                 | the case uses this impact universe               |
| `in_scope`           | `impact_scope`           | `impact_target`                                                | the target belongs to the investigated universe  |
| `assesses`           | `impact_assessment`      | `impact_target`                                                | the assessment classifies the target             |
| `propagates_to`      | `phenomenon` or `impact` | `impact`                                                       | declared impact propagation                      |
| `applies_to`         | `impact`                 | `impact_target`                                                | the impact applies to the target                 |
| `supports`           | `evidence`               | assessment, cause, phenomenon, impact, action, or verification | declared evidentiary support                     |
| `causes`             | `root_cause`             | `phenomenon` or `impact`                                       | declared producing cause                         |
| `contributes_to`     | `contributing_cause`     | cause, phenomenon, or impact                                   | declared contributing condition                  |
| `triggers`           | `trigger`                | `phenomenon`                                                   | declared surfacing condition                     |
| `explains_escape_of` | `escape_cause`           | `phenomenon` or `root_cause`                                   | declared detection/acceptance escape             |
| `corrects`           | `corrective_action`      | root or contributing cause                                     | removes or controls a producing cause            |
| `contains`           | `containment`            | impact or impact target                                        | limits further propagation                       |
| `recovers`           | `recovery`               | impact or impact target                                        | repairs an already propagated effect             |
| `prevents`           | `recurrence_prevention`  | cause or phenomenon                                            | improves future prevention/detection/containment |
| `verifies`           | `verification`           | any action kind                                                | evaluates an action after implementation         |
| `tracks`             | `pending`                | any RCA node                                                   | records an explicitly unresolved obligation      |

No relation is inferred from text, embeddings, target type, temporal proximity, shared evidence, or
graph proximity.

## 5. Impact universe and assessment contract

1. Every case MUST declare at least one `impact_scope` and link it with `documents_scope`.
2. Every target considered part of the investigation MUST be explicitly connected by `in_scope`.
3. Every in-scope target MUST have exactly one current `impact_assessment`. Historical assessments
   may be retained only when their generic state is `superseded`.
4. `affected` and `unaffected` assessments MUST have at least one evidence path. `suspect` and
   `unknown` MUST have a `pending` tracker unless evidence and a later assessment resolve them.
5. An `affected` assessment MUST be connected to at least one `realized` impact applying to the same
   target. A `suspect` assessment may be connected to a `credible` impact.
6. `completeness=complete` asserts only that every member of the author-declared universe has an
   assessment. It does not prove that the chosen universe covers the real world.
7. `partial` and `unknown` scope completeness MUST remain visible in the raw report and prevent a case
   from becoming structurally complete.

## 6. Cause, action, and verification contract

1. A structurally complete case MUST contain at least one `root_cause` connected by `causes` to each
   phenomenon. A contributing cause, trigger, or escape cause cannot substitute for it.
2. Each root-cause claim MUST have a declared evidence path or an explicit generic operation whose
   inputs include evidence and whose output is that cause.
3. Each root cause MUST be targeted by at least one corrective action.
4. Each affected target and each unresolved credible impact MUST have containment, recovery, or a
   `pending` tracker. Correcting only the root cause does not discharge propagated effects.
5. A `trigger` records what surfaced the phenomenon; it does not become a producing root cause unless
   a separate `root_cause` node and causal relation are declared.
6. An `escape_cause` records why detection, review, monitoring, or acceptance did not prevent the
   defect. It never satisfies the producing-cause requirement.
7. `action_state=implemented` asserts execution only. `action_state=effective` requires at least one
   linked verification with `result=passed`.
8. A failed or inconclusive verification MUST keep effectiveness unresolved and MUST be linked to a
   `pending` item or a successor action.
9. Causal and impact propagation subgraphs MUST be acyclic. Cycles are structural errors, not proof
   that the real-world analysis is false.

## 7. Stable audit rules

The profile MUST define at least these stable rule IDs. Strict severity is normative; guided may
downgrade an error to warning only where shown. Fatal syntax/profile/reference failures remain owned
by Generic V2.

| Rule ID      | Condition                                                                                         | Guided  | Strict |
| ------------ | ------------------------------------------------------------------------------------------------- | ------- | ------ |
| `RCA-R1-001` | phenomenon is connected to an action but lacks an impact scope or producing root-cause path       | warning | error  |
| `RCA-R1-002` | case lacks a documented impact scope                                                              | warning | error  |
| `RCA-R1-003` | an in-scope target lacks exactly one current assessment                                           | warning | error  |
| `RCA-R1-004` | affected/unaffected assessment lacks evidence                                                     | warning | error  |
| `RCA-R1-005` | root cause lacks evidence or explicit evidence-producing operation                                | warning | error  |
| `RCA-R1-006` | a settled case has escape cause but no producing root cause                                       | error   | error  |
| `RCA-R1-007` | root cause lacks a corrective action                                                              | warning | error  |
| `RCA-R1-008` | affected/suspect downstream target lacks containment, recovery, or pending                        | warning | error  |
| `RCA-R1-009` | case is settled while scope completeness is partial/unknown or assessments remain suspect/unknown | error   | error  |
| `RCA-R1-010` | action is effective without a passed linked verification                                          | error   | error  |
| `RCA-R1-011` | causal or impact propagation graph contains a cycle                                               | error   | error  |
| `RCA-R1-012` | failed/inconclusive verification lacks pending or successor action                                | warning | error  |

Each finding MUST target the smallest relevant source-backed declarations and include individual
spans. When the missing object has no span, the finding targets the declaration that owns the unmet
obligation and identifies the missing relation or kind in metadata.

## 8. Completion and truth boundary

An RCA case is structurally complete only when:

- its state is `settled`;
- every phenomenon has a documented complete impact scope and producing root cause;
- every in-scope target has a resolved current assessment;
- required evidence, corrective action, containment/recovery, and verification paths exist;
- no blocking R1 finding remains; and
- no required obligation is represented only by an unlinked `pending` node.

Structural completion MUST NOT be labeled as factual correctness, external approval, correction
deployment, action effectiveness in the real world, incident closure, or recurrence prevention.
Those claims require evidence and authority outside LLMThink.

## 9. Required executable fixtures

R1 requires source plus expected raw audit JSON for these six cases:

1. complete impact-aware RCA: phenomenon, complete scope, realized and credible impacts, unaffected
   target, root and escape causes, corrective action, containment, recovery, and passed verification;
2. phenomenon directly to countermeasure: emits `RCA-R1-001` and the relevant missing-scope/cause
   rules;
3. incomplete impact universe: one or more in-scope targets lack assessment and completion is blocked;
4. escape-cause substitution: emits `RCA-R1-006` when review/test omission is used without a producing
   root cause;
5. downstream effects abandoned: emits `RCA-R1-008` when cause correction exists but affected targets
   lack containment/recovery/pending; and
6. unverified action effectiveness: emits `RCA-R1-010` when an implemented action is declared effective
   without passed verification.

Core, CLI raw JSON and text, stdio MCP, Hosted Application Service, LSP, and VSIX MUST agree on rule
ID, severity, target references, spans, and message identity for every fixture after removal of
presentation-only fields.

## 10. V1 coexistence and migration

1. Adding or selecting `rca-impact@1.0.0` MUST NOT change the meaning or findings of any V1 document or
   any V2 document using another profile.
2. V1 RCA-like documents remain valid V1 documents. They are not silently reclassified as RCA R1.
3. A V1-to-RCA migration may preserve declared problem/evidence/decision/pending structure, but it
   MUST NOT infer phenomenon, impact, target classification, root cause, trigger, escape cause,
   containment, recovery, verification, or relation semantics from prose.
4. Missing RCA-specific meaning MUST be reported as source-located migration questions or pending
   requirements. No migration output may claim structural completion from inferred roles.
5. Thought stores are not migrated merely because an RCA profile is installed or a document is
   checked.

## 11. Trust and operational boundaries

- RCA audit reads only the supplied document, verified profile, and explicitly prepared semantic
  inputs allowed by Generic V2.
- `target_ref` is never fetched or used as repository, filesystem, runtime, deployment, or credential
  authority.
- Profile rules cannot run code, commands, resolvers, network requests, or repository inspections.
- Audit does not mutate issues, files, plans, code, tests, remotes, deployments, or thought stores.
- Passing audit does not authorize corrective, containment, recovery, recurrence-prevention, or
  verification actions.

## 12. Acceptance criteria

RCA Profile R1 is accepted only when:

1. the selected three-way combination is recorded without adding RCA parser productions;
2. all required RCA kinds, properties, and relations round-trip losslessly through Generic V2;
3. affected/suspect/unaffected/unknown assessments and complete/partial/unknown scope are independent
   and queryable;
4. realized and credible impacts are distinct and linked to explicit targets;
5. root, contributing, trigger, and escape causes remain structurally distinct;
6. corrective action, containment, recovery, recurrence prevention, and verification remain distinct;
7. all twelve stable rules use only accepted closed Generic V2 constraint operators;
8. all six fixtures produce their exact expected findings and spans across every required surface;
9. the complete fixture has no blocking R1 finding, while each incomplete fixture fails for its
   intended rule without unrelated rule noise obscuring the result;
10. adding the profile causes no implicit finding, AST, help-default, storage, or behavior change for
    unrelated V1 or V2 documents;
11. malicious target references and profile properties cannot trigger I/O or code execution;
12. migration never infers RCA semantics from prose and reports every unresolved role with location;
13. audit PASS and case `settled` are presented only as structural conformance; and
14. no release, publication, deployment, Issue mutation, external action, Generic V2 acceptance, or
    V1 cutover is included in the implementation change set.

## 13. Non-goals

- determining the factual truth of causes, impacts, classifications, or remedies;
- treating a human, tool, LLM, test, review, or monitor observation as a root cause by semantic
  inspection;
- automatically discovering the real impact universe;
- fetching files, commits, requirements, plans, runtime state, remotes, or deployments;
- generating causal, support, impact, containment, or verification links from embeddings or prose;
- adding RCA-specific parser syntax or executable audit plugins;
- modifying V1 orphan, contradiction, semantic, finalize, or thought-store behavior;
- namespace, ACL, cross-thought resolution, release, publication, deployment, or Issue mutation; and
- asserting that structural completeness closes an incident or proves action effectiveness.

## 14. Assumptions and unresolved decisions

- The candidate assumes the exact Generic V2 R1 predecessor is accepted unchanged. If its bytes
  change, this dependency must be reconciled and this candidate revision reviewed again.
- The profile JSON representation and exact message text remain downstream artifacts; rule IDs,
  structural conditions, severities, targets, and message identities are fixed here.
- The complete contents of target universes remain author-declared; automatic discovery is outside
  R1 and may require repository/runtime integrations with separate authority.
- Profile publication, package placement, release activation, and operational incident workflows
  remain separate decisions.

## 15. Step 1 self-review

- The candidate preserves the Issue #44 functional outcome rather than reducing it to a direct
  phenomenon-to-remedy checklist.
- Root cause, contributing condition, trigger, and escape cause are separate.
- Source-cause correction and propagated-impact containment/recovery are separate.
- The selected generic/profile/declarative-audit combination is explicit and alternatives are not
  silently collapsed.
- Structural audit is bounded away from truth judgment, implicit I/O, and action authority.
- V1 and unrelated V2 profiles remain unaffected.
- This candidate does not accept Generic V2 or RCA R1 and does not authorize design, ADR creation,
  implementation, migration, external action, release, or deployment.
