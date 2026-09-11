# Finalize Clean Audit Gate v1 Independent Review Input

## Review identity

- Candidate: `FCAG-V1-R1`
- Candidate path:
  `docs/process/finalize-clean-audit-gate-v1-requirement.md`
- Candidate SHA-256:
  `639be89bd258935dcc9baab96a0faaf14d6d24fb41a2e85a65b0a9689c123efa`
- Review stage: prepared Step 3 input; review not yet authorized or performed
- Owner route: pending Step 2 selection
- Date: 2026-09-08

## Review purpose

Independently determine whether the exact candidate bytes identified above are
acceptable as the versioned requirement for an opt-in local CLI finalize gate.
Do not treat current implementation behavior or Issue wording as sufficient
authority for unstated threshold, failure, or compatibility semantics.

## Source provenance and prior authority

- GitHub Issue #43 requests a final-text and clean-audit digest or revision
  binding.
- Accepted ADR-0001 limits audit to internal-consistency evidence rather than
  truth or approval authority.
- Accepted ADR-0002 defines the severity order.
- Accepted ADR-0023 withdraws `semantic-audit-v1` and selects this smaller
  boundary as the next Issue #43 concern.
- Current local implementation is evidence of storage and CLI behavior, not
  independent acceptance of this candidate.
- Proposed ADR-0008 and hosted service behavior are not accepted authority for
  silently expanding this local CLI requirement.

## In-scope decision

- Whether `--require-clean-audit` should validate an already persisted audit
  without implicitly rerunning it.
- Whether exact UTF-8 source digest matching is the correct local binding.
- Whether `--fail-on error` is the correct default and whether “clean” should
  mean no finding at or above that threshold.
- Whether legacy missing-digest reports should fail closed only under opt-in.
- Whether the listed failure cases and no-mutation guarantee are precise and
  sufficient.
- Whether limiting v1 to the local CLI preserves adapter and hosted authority
  boundaries.

## Out of scope

- Implementation, commit, push, release, deployment, or Issue mutation.
- Adding the option to MCP, hosted APIs, plugin, or VSIX.
- Adopting local revision storage or changing hosted concurrency and
  authorization contracts.
- Reintroducing a semantic-audit artifact or using audit as approval authority.

## Known uncertainties

- Other adapters may eventually need an equivalent gate, but their atomicity,
  confirmation, and revision semantics differ from the local CLI.
- Existing users may have old persisted audit reports without source digests;
  the candidate preserves normal finalize and rejects those reports only when
  the new opt-in gate is requested.

## Expected review checks

- Verify candidate path and exact SHA-256 before review.
- Check the full source-to-audit-to-finalize state transition and all failure
  points.
- Confirm that output filtering cannot alter the gate result.
- Confirm that the threshold order and default match accepted contracts.
- Confirm that every rejection happens before any store mutation.
- Check `.think` and legacy `.dsl` path compatibility.
- Check that no hosted or adapter contract is implicitly accepted.

## Expected review output

- Verified candidate path and SHA-256.
- Reviewer identity and review date.
- Findings with severity, candidate section, evidence, and required resolution.
- Explicit disposition of the local-only scope and legacy missing-digest case.
- Final disposition: `ACCEPT`, `ACCEPT_WITH_EXPLICIT_UNKNOWNS`, `REVISE`, or
  `REJECT`.
- No candidate edits or implementation as part of the independent review.
