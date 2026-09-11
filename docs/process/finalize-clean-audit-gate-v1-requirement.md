# Finalize Clean Audit Gate v1 Requirement Candidate

## Identity

- Candidate: `FCAG-V1-R1`
- Lifecycle stage: Step 1 candidate and self-review
- Status: not accepted
- Source requirement: GitHub Issue #43
- Date: 2026-09-08

## Source provenance and prior authority

- Issue #43 asks for an opt-in gate equivalent to
  `thought finalize --require-clean-audit` that binds final text to a clean
  audit by digest or revision.
- ADR-0001 defines audit as an internal-consistency check, not truth or approval
  authority.
- ADR-0002 defines the ordered severities `fatal`, `error`, `warning`, `info`,
  and `hint`.
- ADR-0023 withdraws the separate `semantic-audit-v1` artifact proposal and
  directs Issue #43 to this smaller final-text/audit binding.
- The current local thought store records `latest_audit_path`; new audit reports
  carry `source_sha256`, while legacy reports may omit it.
- The existing `dsl check --fail-on` default is `error` and fails on findings at
  or above the selected threshold.
- Proposed ADR-0008 and the hosted service define separate revision and
  authorization concerns. They are not accepted authority for changing the
  local CLI contract in this candidate.

## Requirement

### Scope and compatibility

- Add an opt-in `--require-clean-audit` flag to local CLI
  `llmthink thought finalize`.
- Without the flag, preserve the current finalize behavior.
- This candidate does not change MCP, hosted service, plugin, VSIX, or public
  Core APIs.
- The gate is a precondition check over an already persisted audit. It does not
  run a new audit implicitly.

### Finalization target

- Resolve the proposed final text by the existing precedence: explicit file or
  `--text`, otherwise the current draft or final fallback used by the CLI.
- Compute `sha256:<lowercase-hex>` over the UTF-8 bytes of that exact text.
- Do not normalize line endings, whitespace, comments, or formatting before
  hashing.

### Required clean-audit conditions

When `--require-clean-audit` is present, finalize only if all conditions hold:

1. The thought record identifies a latest persisted audit and the report can be
   loaded.
2. The report has a syntactically valid `source_sha256` value.
3. The report `source_sha256` exactly equals the proposed final-text digest.
4. The unfiltered persisted report summary has no finding at or above the
   selected failure threshold.

- `--fail-on <severity>` selects the threshold for this gate.
- The default threshold is `error`, matching `dsl check`.
- Severity order is the accepted ADR-0002 order. For example, `error` rejects
  `fatal` or `error` counts but permits `warning`, `info`, and `hint` counts.
- `--min-severity`, `--suppress-category`, `--suppress-tag`, `--limit`, and
  `--pretty` are presentation controls and must not weaken the gate.
- `semantic_analysis.status` does not independently pass or fail the gate.
  Any emitted findings remain subject to the selected severity threshold.

### Failure semantics

- Distinguish at least these failures in CLI diagnostics: no latest audit,
  unreadable or invalid audit, missing or invalid source digest, source digest
  mismatch, and threshold violation.
- A gate failure exits non-zero.
- Validate every gate condition before writing final text, changing
  `thought.json`, or appending history.
- On gate failure, final text, thought status, paths, timestamps, latest audit,
  and history remain byte-for-byte unchanged.
- A legacy audit without `source_sha256` cannot satisfy the gate; the user must
  audit the target text again.

### Successful finalization

- On success, use the existing finalize write and history behavior.
- The successful finalization summary remains compatible with the current
  thought summary. This candidate does not add an approval or truth claim.
- A matching audit may contain permitted lower-severity findings. “Clean” means
  clean at the selected threshold, not zero findings of every severity.

## Acceptance criteria

- A thought with no persisted audit is rejected without any store mutation.
- A legacy audit with no source digest is rejected without mutation.
- A latest audit whose digest differs from the proposed final text is rejected
  without mutation.
- A matching audit with a finding at the default `error` threshold is rejected
  without mutation.
- A matching audit with warnings only finalizes under the default `error`
  threshold and is rejected under `--fail-on warning`.
- Output filtering or suppression cannot turn a failing persisted report into a
  passing gate.
- A matching audit with no threshold violation finalizes using the existing
  final path, status, and history behavior.
- Finalize without `--require-clean-audit` retains current behavior.
- Canonical `.think` and legacy `.dsl` thought paths both work without rename.
- CLI help, README, source tests, built artifacts, and source maps are updated
  consistently.

## Out of scope

- Automatically auditing during finalize.
- Treating audit as truth, approval, publication, or deployment authority.
- Requiring zero `warning`, `info`, or `hint` findings by default.
- Adding a local thought revision model.
- Changing hosted optimistic concurrency, confirmation-token, or authorization
  contracts.
- Adding the gate to MCP, hosted API, plugin, or VSIX.
- Changing semantic embedding availability requirements.
- Migrating or rewriting legacy audit reports.

## Assumptions and unknowns

- The local CLI is the first bounded consumer because it already owns the
  synchronous file-store finalize path.
- Exact-byte digest matching is sufficient for the local single-process gate;
  hosted concurrent mutation still requires its own revision contract.
- Whether other adapters should later expose the same option depends on their
  separate authorization, confirmation, and concurrency contracts.

## Compatibility disposition

- Preserve all flag-off behavior.
- Fail closed for old reports only when the new gate is explicitly requested.
- Reuse the accepted severity vocabulary and current `--fail-on` default.
- Do not infer cleanliness from filtered output or embedding availability.

## Self-review

- The candidate addresses only final-text/audit identity and threshold status.
- It preserves the distinction between audit evidence and approval authority.
- It does not rely on the withdrawn semantic-audit artifact proposal.
- Failure atomicity is explicit and independently testable.
- The hosted revision and authorization model remains outside this local CLI
  requirement.
