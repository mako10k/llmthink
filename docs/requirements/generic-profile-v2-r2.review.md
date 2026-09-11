# Independent-review input: Generic Profile and Audit Contract V2 R2

Status: proposed Step 3 input; Step 2 owner route not yet selected

Candidate: `docs/requirements/generic-profile-v2-r2.md`

Candidate digest: `sha256:89f20a526d4bf67df4c9576b529d3e8b13a617218935d12551fc2e3f0b9e8cc8`

Japanese review support: `docs/requirements/generic-profile-v2-r2.ja.md`

Japanese translation digest: `sha256:6580485352866554ac6130e43f630310902c2e4019c99de592315d4ea24bcc95`

## Review authority

Review only the exact candidate bytes identified above. Do not edit the candidate and do not treat a
review finding as requirement text. Classify each material finding as one of:

- contradiction with the candidate or authoritative source;
- evidence gap or unresolved unknown;
- optional or future candidate; or
- out of scope.

Severity describes impact inside that classification. Review completion does not accept the
requirement or authorize an ADR, implementation, migration, release, deployment, or Issue mutation.

## Source provenance and prior-authority disposition

The candidate freezes the owner coexistence direction and exact source snapshots for Issues #10,
#25, and #43, the current V1 requirements, ADRs 0018/0019/0021/0023, the reconciled V1 audit
baseline, and the accepted PERT ordering. Review whether it correctly:

1. keeps V1 as the default and preserves current V1 behavior;
2. limits Issue #25 breaking simplification to explicitly selected V2 documents;
3. retains Hosted MCP V1, root compatibility, and the ADR-0023 withdrawal;
4. treats current implementation only as feasibility evidence; and
5. preserves namespace/cross-thought work as a future extension rather than rejecting it or making
   it an R1 blocker.

## In scope

- explicit V2 grammar/profile selection;
- the generic declaration/link/operation/query grammar and normalized IR;
- immutable profile identity, version, RFC 8785 digest, and manifest binding;
- a closed declarative constraint vocabulary and non-executable profile boundary;
- discipline behavior, stable findings, target spans, and lossless raw reports;
- current-document read-only DSLQL;
- explicit, deterministic, fail-closed V1 document migration;
- explicit profile-aware help navigation over one registry, with V1-default preservation, offline
  failure/recovery behavior, and executable examples;
- V1 coexistence and no implicit source/store/public-surface changes;
- trust, resource-limit, and failure semantics; and
- cross-surface structural conformance criteria.

## Out of scope

- V1 cutover, deprecation, or removal;
- namespace/ACL/OAuth/cross-thought loading and Hosted ScopeExpr;
- truth, evidence-strength, causal-validity, goal-achievement, or semantic-relation inference;
- executable or remotely loaded profiles;
- thought-store migration execution;
- Hosted MCP V1 or root compatibility changes;
- acceptance of a specialized profile; and
- release, publication, deployment, production activation, or Issue mutation.

## Acceptance focus

The independent review must test the complete twenty-one-item acceptance section, with particular
attention to:

- unambiguous V1 versus V2 dispatch;
- whether a new profile can be added without parser or Core IR change;
- whether the closed operators can express required structural profiles without hidden code;
- whether digest/version failures are fail-closed;
- whether V1 migration is deterministic, non-mutating, and loss-aware;
- whether raw findings retain stable identity and per-target spans across all adapters; and
- whether every registered help route, alias, and example is complete and consistent across
  surfaces without use-case-specific parser or dispatch branches; and
- whether excluded namespace/release/cutover work is truly absent from R1 completion.

## Known unknowns

- Exact profile JSON Schema and package placement remain downstream design artifacts.
- The first bundled `reasoning@2.0.0` profile bytes and digest do not yet exist.
- Exact CLI argument ordering and the physical help-registry representation remain downstream
  design choices.
- Namespace-aware querying and cross-thought references remain a future requirement decision.
- V2 release, activation, and any V1 retirement path remain undecided.

## Review questions

1. Does the `think <profile>@<version>` header create an unambiguous V2 selector while preserving
   every current headerless/V1 source path?
2. Does the profile reference and RFC 8785 digest contract prevent silent profile drift?
3. Is the closed constraint vocabulary sufficient for generic graph/profile validation without
   enabling executable profile logic?
4. Are discipline-specific severities prevented from weakening syntax, identity, reference, and
   integrity failures?
5. Can migration preserve all official V1 examples or fail with precise location and reason, with no
   implicit source or thought-store write?
6. Do the report and conformance criteria preserve lossless raw data and identical structural
   findings across Core, CLI, MCP, LSP, and VSIX?
7. Does the R1 scope correctly separate namespace/authorization work while retaining a viable future
   prepared-runtime boundary?
8. Does any clause silently change an accepted V1, Hosted, public-name, or semantic-audit authority?
9. Does help navigation remain explicitly V2/profile selected, deterministic, offline, and generated
   from the same verified profile identity rather than duplicated per use case?
10. Do exhaustive route and example criteria prevent missing topics, broken aliases, undocumented
    fallback, and examples that do not parse or audit under the displayed profile?

## Route after independent review

The Step 2 owner must select one route before this input is used:

- `REVIEW_THEN_REVISE`: review the unchanged snapshot, then return to Step 1; or
- `REVIEW_THEN_DECIDE`: review the unchanged snapshot, then present it and the report for Step 4.

The owner may instead choose `REVISE` and skip independent review, or `REVIEW` without added owner
questions. No route is inferred by this document.
