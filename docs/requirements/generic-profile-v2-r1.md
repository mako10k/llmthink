# Generic Profile and Audit Contract V2 — Requirement Candidate R1

Status: Step 1 candidate, self-reviewed, not accepted

Requirement revision: R1

External contract name: Generic Profile and Audit Contract V2

Candidate date: 2026-09-11

Decision owner: llmthink decision owner

## 1. Purpose

This candidate defines a second, explicitly selected LLMThink grammar and runtime model built from
generic declarations, links, operations, and read-only queries. Use-case meaning belongs to a
versioned profile instead of parser-specific statement branches.

V2 is additive beside V1. It does not replace, reinterpret, migrate, deprecate, or change the
default behavior of V1 documents, thought stores, commands, reports, or public adapters. Any future
V1 cutover or retirement requires a separate owner decision.

## 2. Authority and source snapshot

The following inputs are frozen for this candidate. GitHub body digests are SHA-256 over the exact
UTF-8 issue body, without a CLI-added trailing newline.

| Input                        | Snapshot                                                                                           | Disposition in R1                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Owner direction, 2026-09-11  | “Keep V1 while proceeding with V2”                                                                 | Normative coexistence boundary                                                 |
| GitHub Issue #10             | Updated 2026-05-08; body `sha256:08d393d8b62676d0426e94c54edecfeb6501c7d8b12d6c96e2851264b5f32f71` | Preserve its V1 profile-by-guidance behavior; do not mutate V1 roles           |
| GitHub Issue #25             | Updated 2026-08-19; body `sha256:e1d77d8b4ac58964ace1303b32299712ea93c5ed2e29ec40a10797bdea5f19df` | Primary V2 proposal; narrowed by later coexistence authority and this R1 scope |
| GitHub Issue #43             | Updated 2026-09-08; body `sha256:5fec6a52fad9b96730e7cc264c5a0175297f21dc4f0d7f8c4e695b1153224076` | Current V1 audit baseline and provenance requirements                          |
| `docs/specs/requirements.md` | `sha256:7d6c93d8c67f903c3730d2b5872f72bed796fe7af2f512c5b62c4c9604c35812`                          | Existing V1 normative baseline; preserved                                      |
| ADR-0018                     | `sha256:0eb3f1a1f1bf03dfb09acde37b5b72ff3bc121761dc05fbdcd54c1c4df1d3beb`                          | Preserve versioned-contract and conformance boundaries                         |
| ADR-0019                     | `sha256:76b3f01c6e29dad77641b43ec40e7b07329cabdb9cc8fad777e2efdeea56f1d4`                          | Preserve staged server and live-binding boundaries                             |
| ADR-0021                     | `sha256:370be2fe27dedc739e4b8438e6a797925c6ab28e70f84550ad6a794f623ad70a`                          | Preserve Hosted V1 and root compatibility surfaces                             |
| ADR-0023                     | `sha256:587d4142d8dc47bb31d52a02279487fdbf74fb9d4a66a72451b621385fbfcee4`                          | Do not recreate a semantic-audit artifact or truth authority                   |
| Issue #43 reconciliation     | `sha256:670625a36972a6fca7c35c918a052f4a919c1a67bbb90b858557c7c441569dae`                          | Feasibility evidence only; not requirement authority                           |
| `plans/rca-profile-v2.pert`  | `sha256:a78302cb3c8e08639029c8b922d0af14f124d91ab1f88a537840e6b67b05caa0`                          | Delivery ordering and review gates; not product authority by itself            |

## 3. Prior-authority disposition

1. V1 remains the default grammar when a source does not explicitly select V2.
2. Existing V1 role names, AST collections, audit rules, DSLQL behavior, `.think`/`.dsl` handling,
   thought-store semantics, and public adapter behavior remain unchanged by this contract.
3. The V2 simplifications proposed by Issue #25 apply only inside an explicitly selected V2
   document and V2 runtime.
4. Current Hosted MCP contract V1, root exports, and compatibility bins are neither renamed nor
   removed by this contract.
5. Existing semantic sidecars remain outside the V2 document grammar. This contract does not
   restore the withdrawn `semantic-audit-v1` proposal.
6. Issue #25 namespace locators, hosted scope expressions, authorization, pagination across
   thoughts, and cross-namespace loading remain a future extension. R1 must leave a typed extension
   boundary, but they are not R1 acceptance criteria.

## 4. Definitions

- **V1 document**: a document parsed under the existing grammar version `1`.
- **V2 document**: a document whose first non-comment declaration explicitly selects the V2
  profile header defined below.
- **profile**: immutable declarative data defining allowed kinds, relations, operators, properties,
  containment, states, transitions, structural constraints, severity, and query templates.
- **profile reference**: the tuple `profile_id`, `profile_version`, and `profile_digest`.
- **Core V2 IR**: the normalized, use-case-neutral representation of one V2 document.
- **structural audit**: validation of declared syntax, identity, references, graph shape, profile
  constraints, and lifecycle declarations without judging real-world truth.
- **presentation**: human-oriented rendering that may filter or abbreviate only when raw counts and
  truncation are explicit; it never mutates the raw result.

## 5. Explicit grammar and profile selection

1. A V2 source MUST begin with this header, apart from comments and blank lines:

   ```think
   think <profile-id>@<profile-version>:
     discipline loose|guided|strict
   ```

2. The initial bundled reasoning profile reference is `reasoning@2.0.0`.
3. The `think` header is the only automatic V2 dispatch signal. A source without it MUST follow the
   existing V1 dispatch path; implementations MUST NOT infer V2 from later tokens or file contents.
4. Unknown profile IDs or versions, unavailable profile bytes, and profile digest mismatches MUST
   fail closed. No nearest-version, latest-version, network, or V1 fallback is permitted.
5. The resolved profile reference MUST be present in the normalized document and every raw audit
   report.
6. Profile version is semantic-version text. Profile bytes are identified by `sha256:<lowercase
hex>` over RFC 8785 canonical JSON bytes.
7. A package-bundled profile MUST have a manifest that binds its ID and version to exactly one
   digest. An explicitly supplied profile MUST be verified against its caller-supplied digest before
   parsing or auditing the dependent document.

## 6. V2 core syntax and normalized IR

The V2 parser recognizes only four executable declaration families after the `think` header:

```think
<kind> <id>:
  "text"
  state <state>
  <property> <value>

link <from> <relation> <to>:
  <property> <value>

op <id> <operator> <input-ref-list> -> <output-ref-list>:
  <property> <value>

query <id>:
  <dslql-expression>
```

Single-line node declarations remain valid. Containers use nesting, but normalization records
membership as `parent_id` plus source order. Core MUST NOT contain parser branches named for a
particular use case.

The normalized document contains exactly these top-level collections:

```text
document
├── grammar_version
├── profile_ref
├── discipline
├── nodes[]
├── links[]
├── operations[]
└── queries[]
```

Every source-backed node, link, operation, query, and property MUST retain a common source span with
source identity and start/end line and column. Nodes contain `kind`, `id`, optional text, state,
properties, `parent_id`, source order, and span. Links contain endpoints, relation, properties,
source order, and span. Operations contain ID, operator, ordered inputs and outputs, properties,
`parent_id`, source order, and span. Queries contain ID, expression, source order, and span.

## 7. Declarative profile contract

A profile MUST be immutable data and MUST define:

- profile ID, semantic version, schema version, and digest;
- allowed node kinds and their text, state, property, and containment contracts;
- allowed relations, directionality or symmetry, endpoint-kind contracts, and properties;
- allowed operators, input/output arity, input/output-kind contracts, and properties;
- allowed states and state transitions;
- default discipline and discipline-specific severity mapping;
- stable rule IDs and target-selection rules;
- optional read-only query helpers and templates; and
- compatibility declarations for the grammar and profiles it extends.

Profile constraints may compose only these closed operators in R1:

- `reference_exists`
- `kind_allowed`
- `endpoint_kinds`
- `arity`
- `property_required`
- `property_value_in`
- `unique`
- `count`
- `relation_required`
- `relation_forbidden`
- `path_required`
- `acyclic`

Each constraint may select targets by declared kind, relation, operator, property value, state, or
containment and may combine selectors using closed `all`, `any`, and `not` predicates. It may emit
only a stable rule ID, category, severity selected by discipline, target references, message key,
and declared metadata.

Profile data MUST NOT contain executable code, regular-expression execution supplied by the
profile, shell commands, dynamic imports, callbacks, network locations, filesystem locations, or
provider credentials. Adding a new constraint operator changes the Generic Profile and Audit
Contract and requires a new reviewed contract revision; adding a profile using the closed contract
does not require a parser change.

## 8. Discipline

- `loose` enforces syntax, unique identities, resolvable references, profile identity, and profile
  contract integrity. Other profile constraints are informational unless the profile declares them
  invariant.
- `guided` additionally reports missing provenance, relation, property, containment, and lifecycle
  structure using the profile's guided severities.
- `strict` enforces all profile constraints and transitions using the profile's strict severities.

Syntax failure, ambiguous identity, unresolved references needed for structural interpretation,
profile unavailability, digest mismatch, and invalid profile data never become successful merely
because `loose` is selected.

## 9. Structural audit and raw report

1. Audit MUST evaluate only declared structure and explicitly supplied inputs.
2. Audit MUST NOT decide proposition truth, evidence quality, causal truth, goal achievement,
   semantic equivalence, statistical independence, or real-world state.
3. Core audit MUST perform no implicit network, filesystem, repository, thought-store, embedding,
   or provider access.
4. Findings MUST expose stable rule ID, category, severity, each target reference with its own span,
   message identity, message, and optional rationale, suggestion, and metadata.
5. The raw report MUST include source digest, grammar version `2`, complete profile reference,
   engine version, package version, semantic provider/model/status, summary counts, findings, and
   ordered lossless query values.
6. Provider unavailability MUST be explicit and MUST NOT substitute synthetic similarity or a
   lexical/all-candidate fallback that changes query meaning.
7. Presentation may filter by severity/category/location and may truncate values only after raw
   evaluation. It MUST report the unfiltered or pre-truncation count and truncation state.
8. CLI, Core, stdio MCP, Hosted Application Service, LSP, and VSIX MUST produce conformant structural
   identities: rule ID, severity, target reference, span, and message identity. Adapter-only display
   fields may differ.
9. A structurally clean report proves only conformance to the selected profile snapshot. It does not
   prove truth, approval, implementation, effectiveness, release, or external acceptance.

## 10. Read-only DSLQL

1. V2 DSLQL reads `nodes`, `links`, `operations`, and `queries`; it MUST NOT add a top-level
   collection for each profile kind.
2. R1 provides only current-document scope.
3. Generic helpers are limited to `links([relation])`, `inputs()`, `outputs()`, `producer()`,
   `upstream([relation])`, `downstream([relation])`, and `lineage()`.
4. A profile may supply query templates and names that expand to ordinary DSLQL, but it MUST NOT
   install executable evaluator code.
5. Query execution is read-only and MUST NOT fetch, persist, finalize, approve, mutate, or infer
   missing links.

Namespace-aware `from` expressions and cross-thought loading require a later requirement. Their
future addition MUST preserve Core evaluation over an authorization-prepared runtime rather than
giving Core direct storage or network authority.

## 11. V1 coexistence and migration

1. Existing V1 parsing, formatting, auditing, help, examples, DSLQL, storage, and public adapters
   MUST remain available and retain their current default behavior.
2. V2 MUST be selected explicitly. Installing or enabling V2 MUST NOT rewrite a V1 source or thought
   store.
3. Migration MUST have a read-only check form and an explicit output form:

   ```text
   llmthink migrate input.think --to 2 --profile reasoning@2.0.0 --check
   llmthink migrate input.think --to 2 --profile reasoning@2.0.0 --out output.think
   ```

4. Migration MUST parse with the V1 parser, convert through a typed migration model, and format V2;
   it MUST NOT use text replacement as the authoritative transform.
5. V1 `based_on problem` maps to a V2 `addresses` link. Other V1 `based_on` references map
   conservatively to `basis_for`; migration MUST NOT infer `supports`.
6. Step wrappers are removed while preserving statement source order. Comparison, partition,
   annotation, and raw-axis conversions follow explicit typed mappings.
7. Any ambiguous scope, identity collision, unsupported role/property, non-equivalent DSLQL, or
   information loss MUST fail closed with source span, reason, and a correction candidate. It MUST
   NOT emit a silently lossy output.
8. Repeating migration over the same V1 bytes, profile bytes, and options MUST produce identical V2
   bytes.
9. Thought-store migration is a separate, explicitly invoked, copy-preserving operation with
   revision and digest readback. Document migration acceptance does not authorize store migration.
10. V1 compatibility readers may be used at the migration boundary but MUST NOT become hidden V1
    branches inside the V2 runtime.

## 12. Trust and failure boundaries

- Profile resolution is caller-supplied or package-bundled and digest-verified.
- Core never downloads profiles or follows document locators.
- External resources remain structural metadata unless a separately authorized resolver supplies
  verified content.
- Unknown profile, unsupported contract version, invalid constraint, digest mismatch, resource
  exhaustion, and unavailable required provider fail closed with distinct machine-readable codes.
- Limits for nodes, links, operations, nesting, constraints, traversal depth, and query results MUST
  be explicit inputs and reflected in raw truncation or failure metadata.
- A profile cannot grant filesystem, network, repository, namespace, credential, persistence,
  finalization, approval, release, or deployment authority.

## 13. Acceptance criteria

R1 is satisfied only when all of the following are demonstrated against the accepted candidate
snapshot:

1. A V2 document requires the explicit `think <profile>@<version>` header, while a headerless/current
   V1 fixture still uses the unchanged V1 path.
2. The Core parser has no use-case-specific branches and emits only the normalized V2 collections.
3. Adding a fixture-only profile with existing closed operators requires no parser or Core IR schema
   change.
4. A simple problem/evidence/decision document remains under ten non-blank source lines.
5. Goal-free exploration, goal-directed decisions, derive, combine, split, partition, and cross are
   expressible with the same core grammar.
6. Profile identity/version/digest mismatches fail closed and appear in raw machine-readable output.
7. `basis_for`, `supports`, and `stimulus_for` remain distinct declared relations; none is inferred
   from embedding or shared references.
8. Derived/combined/split/partition provenance is queryable from operations without handwritten
   derived states.
9. The same fixture changes severity across loose/guided/strict exactly as its profile contract
   declares, without weakening syntax, identity, reference, or digest failures.
10. Every source-backed target in every raw finding has an individual span.
11. CLI, Core, stdio MCP, Hosted Application Service, LSP, and VSIX conformance fixtures agree on
    rule ID, severity, target references, spans, and message identity.
12. Semantic-provider unavailability is explicit and does not change a semantic query into a
    different fallback query.
13. Every official V1 example has a migration fixture, and no fixture loses information without an
    error carrying source location and reason.
14. Repeated migration is byte-stable and never overwrites its input or mutates a thought store.
15. The complete existing V1 corpus and public-surface fixtures show no implicit grammar, AST,
    audit, help, storage, finalization, or public-name change.
16. A malicious profile fixture cannot execute code, access network/filesystem/storage, or add an
    unknown constraint operator.
17. Raw audit output stays lossless; any presentation truncation reports total counts and truncation.
18. Namespace, release, package publication, deployment, and V1 cutover are absent from the
    implementation change set unless separately accepted.

## 14. Non-goals

- replacing, deprecating, or removing V1;
- automatically choosing V2 or migrating V1;
- proposition truth, evidence-strength, causal-validity, goal-achievement, MECE-truth, or
  orthogonality judgment;
- executable or remotely loaded profiles;
- namespace resolution, ACL, OAuth, cross-thought loading, hosted scope expressions, or direct Core
  I/O;
- restoring the withdrawn semantic-audit artifact;
- changing Hosted MCP contract V1 or root compatibility surfaces;
- release, publication, deployment, production activation, or Issue mutation; and
- accepting any specialized profile, including RCA Profile R1, merely because this generic contract
  is accepted.

## 15. Assumptions and unresolved decisions

- R1 assumes `reasoning@2.0.0` is the first bundled profile; its actual profile bytes and digest are
  an implementation artifact reviewed after this contract, not supplied by this requirement text.
- The exact JSON Schema and wire layout for profile data remain a design artifact, but they MUST
  implement the complete closed contract above without adding semantics or operators.
- Namespace-aware querying remains undecided for a later revision; R1 neither accepts nor rejects
  the broader Issue #25 proposal.
- Package/repository placement, release version, activation, and V1 retirement remain separate owner
  decisions.

## 16. Step 1 self-review

- Source provenance and later owner direction are explicit.
- V1 and accepted Hosted/public contracts are preserved rather than silently superseded.
- The external V2 selector, profile identity, digest, closed constraints, audit boundary, migration
  failures, and acceptance criteria are stated normatively.
- Namespace scope and other future ideas are not acceptance blockers.
- Existing implementation is used only as feasibility evidence.
- This candidate does not authorize design, ADR creation, implementation, migration, release,
  deployment, or acceptance.
