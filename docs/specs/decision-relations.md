# Decision reference relations

Status: accepted direction, implementation contract.
Owner source (chat, 2026-11-06):
「では、based_on と acts_on を分け、relation で詳細を記述する方針で改訂案をまとめてください。原因未確定の構文例と監査ルール、後方互換の条件も含めて。実装はまだ行わないでください。」
Subsequent implementation authority:
「OK。仕様として固めて、実装を進めてください。」

## Contract and boundary

This extension keeps the existing DSL and statement families. It adds optional decision
target references, edge details, a role annotation and explicit built-in audit-profile selection.
It introduces neither propositional logic nor a causal-truth solver, a new generic V2 runtime,
executable macros, external profile loading, or a model-based semantic reviewer.
The preserved Generic V2 R2 acceptance and RCA R4 review in the separate
`codex/v2-requirements-r1` worktree are not rewritten, implemented or declared superseded.
This change delivers the additive syntax approved in this chat, independently of that future work.
No release, install, deployment, push or merge is included.

## Grammar

```ebnf
Decision = "decision" ID ["based_on" IDs] ["acts_on" IDs] ":"
           newline indent TextBody { Annotation | Relation } dedent ;
Relation = "relation" ("based_on" | "acts_on") ID ":"
           newline indent Kind [Status] [Mechanism] [Evidence] dedent ;
Kind = "kind" ("support" | "causal" | "intervention" | "mitigation" | "recovery") ;
Status = "status" ("hypothesis" | "confirmed" | "refuted") ;
Mechanism = "mechanism" TextBody ;
Evidence = "evidence" IDs ;
```

Fields in a relation are order-independent; each occurs at most once and kind is mandatory.
Mechanism supports quoted and block text. Quoted mechanisms use JSON string escaping:
the parser decodes escaped quotes, backslashes and control characters, and the formatter
retains quoted form so leading/trailing whitespace and escaped newlines survive round trips.
Invalid quoted escapes are parse errors. Existing legacy text fields are unchanged. Relation headers always name the reference family.
Annotations and relations can be interleaved; formatting canonicalizes annotations before relations.
New fields and acts_on lists reject invalid or duplicate entries. Existing based_on parsing
and its historical treatment of duplicate/empty items are unchanged.
Clause order is based_on followed by acts_on. Names are contextual, not globally reserved.
Both reference families target declared problems or statements, not steps, resources or domains.
Relation evidence has the same target namespace and is supplementary support for the edge itself;
it does not implicitly create a based_on or scoring edge.
A relation must detail a reference already in the owning decision's matching header list.
Duplicate family/target detail declarations are contract errors.
One ID may occur in both families; these remain independent edges.

## Meaning and direction

- based_on: target supports the owning decision, with legacy meaning unchanged.
- based_on/support: explicitly records the same meaning as an undetailed reference.
- based_on/causal: adds the claim that target causes the event described by the owner.
  Direction: target -> owner. This never establishes cause from correlation or reference alone.
- acts_on: owner claims an action upon target. Direction: owner -> target.
- acts_on/intervention: change target's state or producing condition.
- acts_on/mitigation: reduce a target impact.
- acts_on/recovery: recover from an already realized target impact.

No kind or status is inferred from prose. Missing status is unassessed.
Confirmed is the author's claim, not engine certification.
Refuted relations remain visible but are excluded from active causal/coverage paths.
An acts_on reference or reachable path never proves actual effectiveness, sufficient coverage,
verification success, or authority to execute an action.
Causes removed now do not automatically erase previously realized impacts.
Cycles may describe feedback; traversal terminates using visited sets, without globally forbidding cycles.
Cause existence and downstream-impact existence are evaluated with two multi-source traversals
per audit (forward from causes, backward from impacts), without per-phenomenon/per-cause repetition.

## Roles and profile selection

The existing annotation mechanism accepts an additional `role` kind on its existing owners.
Role content is optional in ordinary documents and has no effect on legacy audit rules.
The built-in profile uses the exact scalar values phenomenon, cause, impact, measure, cause_unknown.
A node has at most one role in that profile; cause_unknown belongs to pending.
It does not change the statement's AST role (premise, decision, pending, etc.).
Alias and macro syntax are not required; future sugar must expand to these same contracts.

Select the profile explicitly in the existing framework:

```text
framework Incident:
  profile causal-impact-v1
```

The new framework rule `profile` selects a versioned, offline built-in audit set.
Unknown profile values produce fatal findings; no fallback, network fetch or external execution.
The profile applies to explicitly role-tagged nodes in the document. Cause-to-phenomenon
association uses active directed causal paths. A cause_unknown pending must be directly
listed in the phenomenon decision's based_on; unrelated pending elsewhere does not satisfy it.
Impact analysis follows active causal paths from each phenomenon and cause, including chains
and shared impacts. Analysis boundaries and negative findings remain explicit rationale/caveat notes.
Reachability is restricted to recorded relations; it cannot detect all unrecorded real-world effects.
Refuted nodes can remain as history; removing their active causal relation excludes their claim
from a phenomenon's cause paths. No node status is inferred from edge status.

## Unknown cause and containment example

See [causal-impact-unknown.think](../examples/causal-impact-unknown.think).
An unknown cause is a pending, not a fabricated cause node or causal edge.
Candidate causes and their outgoing effects can still be modeled as hypotheses.
Pending text records investigation, discriminatory observations, owner and reassessment.
An annotation todo identifies the investigation plan explicitly.
Notes are human-readable: presence checks and review prompts do not certify their adequacy.
A temporary measure can target the phenomenon while leaving root-cause work and other impacts open.

## Audit rules

All findings use existing report categories. Rule identity is carried in metadata.rule_id,
with source coordinates and target references. Parser shape/enum failures retain parse-error fatal
behavior; resolved-but-inconsistent relation contracts produce errors.

| Rule   | Condition                                                                               | Severity                 |
| ------ | --------------------------------------------------------------------------------------- | ------------------------ |
| REL001 | Unresolved acts_on or relation evidence reference                                       | fatal                    |
| REL002 | Detail target is absent from the matching header list                                   | error                    |
| REL003 | Kind is incompatible with its reference family                                          | error                    |
| REL004 | Duplicate family/target relation details                                                | error                    |
| CI000  | Unknown selected profile                                                                | fatal                    |
| CI001  | Invalid/duplicate profile role or cause_unknown on a non-pending                        | error                    |
| CI002  | Confirmed relation lacks edge evidence references                                       | error                    |
| CI003  | Action reference lacks detail or a nonempty mechanism                                   | warning                  |
| CI004  | Phenomenon has neither active causal candidate nor directly referenced cause_unknown    | warning                  |
| CI005  | Cause unknown has no todo investigation note                                            | warning, review required |
| CI006  | Cause unknown has a todo: review discriminating observation, owner, reassessment        | warning, review required |
| CI007  | No downstream impact and no rationale/caveat explaining the analysis boundary           | warning                  |
| CI008  | Cause has neither active detailed action targeting it nor rationale/todo disposition    | warning                  |
| CI009  | Impact has neither active detailed action targeting it nor rationale/todo disposition   | warning                  |
| CI010  | Measure lacks action targets                                                            | warning                  |
| CI011  | Review measure residual effects, side effects, verification, ownership and reassessment | warning, review required |

REL rules apply whenever the new structure is present. CI rules apply only to the selected profile.
CI002 applies to explicitly confirmed detailed relations, not to legacy based_on references.
CI008/009 record presence of a response claim, not that its effect is complete; bare acts_on
without relation details does not count, and CI003 separately requests those details.

CI005/006/011 are deterministic review prompts, not automated semantic judgments.
Human/LLM review must additionally assess evidence relevance, causal plausibility, omitted effects,
whether hypotheses were promoted to certainty, whether an upstream fix also restores existing
damage, deferral authority, and effectiveness under real operating conditions.
The engine does not issue a semantic or operational PASS for those obligations. Their review
status is not inferred from a clean structural report or the existence of notes.
There is no new finalize/approval/operational completion gate.

The selected profile also emits CI012 (warning) if no statement is explicitly marked
phenomenon, so an unclassified document does not silently appear to satisfy this analysis.
Role annotations on problems are not statement classifications; use statements for this profile.

## Compatibility and public surfaces

- New parser accepts legacy documents; optional AST fields are absent when not authored.
- Legacy documents retain parsing, formatter, audit, query, confidence and persistence semantics.
  Existing enum/property sets are extended; existing string values and statement roles remain.
- based_on collections and based_on_refs(), orphan checks, shared-support logic and confidence
  remain support-only. acts_on and edge evidence never join them.
- DSLQL adds acts_on and relations on decisions only when authored. Edge details expose family,
  target_id, kind, status, mechanism, evidence and source/body spans.
- Stored source remains the authoritative text; format and read/write preserve new semantics.
- CLI, stdio MCP, hosted audit and LSP share Core parsing/audit. Profile selection is in-source,
  so there is no divergent adapter-specific rule implementation.
- LSP reference/rename and preview must distinguish support/causal input from outgoing action
  targets; relation details and their evidence references participate in navigation.
- Old readers are not promised to accept new syntax. No silent down-conversion, and in particular
  no acts_on -> based_on substitution. A future migration must report information loss.
- Profile-free role notes and plain acts_on are not interpreted as automatic causal analysis.
- New features retain grammar-version 1 because this is the approved additive V1 extension;
  grammar version alone is not a capability negotiation mechanism for old executables.

## Verification obligations

Compare old source documents' AST, formatted text, normalized raw audit (excluding generated_at)
and DSLQL with the pre-change baseline. Exercise relation errors, unknown causes, missing
impact branches, containment, refutation, feedback cycles, repeated targets across both families,
source spans, round-trip text, stored thought reload, Core/CLI/MCP/LSP behavior and preview.
Compile root, Core, hosted server and extension. Review generated tracked artifacts.
