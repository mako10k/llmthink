# Decision relation extension — local validation

Date: 2026-11-06
Branch: codex/causal-relations
Base: 8cce0d9812f4d1841e2c26c96c29ed6982bb34c9 (main and fetched origin/main matched).

## Agreement and implementation

Owner source and interpreted scope are preserved in
[the contract](../specs/decision-relations.md) and
[ADR-0024](../adr/0024-decision-reference-relations.md).
Implementation and local validation were authorized; release, installation, publication,
push, merge and deployment were not performed.
The preserved separate Generic V2 / RCA review worktree was left unchanged.

Core owns the AST, parser, formatter, relation validation, causal-impact profile and DSLQL
projection. Existing public adapters consume that shared contract.
LSP includes reference-family-qualified navigation/rename, edge evidence navigation,
profile/role completion, new-rule metadata and source edits that retain acts_on.
Preview renders outgoing actions distinctly and retains relation details.
No automatic factual semantic reviewer or operational recovery certification is introduced.

## Results

- Node.js 24.19.0: `npm run build` and extension TypeScript check passed.
- `npm run test:all`: 286 passing, zero failures:
  Core 129, contracts workspace 11, root conformance 17, Server 67, application 62.
- Installed Chromium headless shell 1243 was selected through
  `LLMTHINK_TEST_CHROMIUM_EXECUTABLE`; no browser was installed.
  Default Playwright browser revision 1217 is absent in this environment.
- The initial Node.js 25 run hit the existing SQLite lifecycle Node 24 requirement.
  Validation was repeated under the already installed supported Node 24.
- `npm run lint` passed, including the existing cyclomatic and cognitive complexity limits.
- `npm run deadcode` passed. The LSP process test uses the declared languageserver
  package's JSON-RPC exports rather than importing an undeclared transitive dependency.
- Distributed stdio MCP and LSP process tests passed again after final test cleanup.
- Root and bundled extension/LSP generated outputs were rebuilt from the final source.
- Before changing runtime output, 36 existing .think/.dsl example/process documents were
  captured with the pre-change compiled Core. Their AST, canonical format and raw audit
  (excluding generated_at) compare exactly against the final implementation.
  Legacy query results in those reports were included in the comparison.
- New regressions exercise hypothesis/refutation, unknown causes, separate impact paths,
  containment with open cause/impact disposition, invalid relation contracts, cycles,
  legacy contextual identifiers, confidence/orphan isolation, formatting and DSLQL.
- CLI, Core and Hosted Application expose identical profile findings.
  Thought source reload preserves all authored data.
  Preview tests inspect the actual rendered causal and outgoing action edges.
- Repository PERT files passed installed perttool document check, dag analyze with both
  schedules, and dag next. The npm check:plans wrapper cannot resolve its uninstalled
  local perttool dependency; equivalent installed CLI operations were used without installation.
- LLMThink non-persistent review of the implementation conclusions:
  fatal=0, error=0, warning=0, info=1 (the acknowledged remaining baseline issue).

## Known baseline issue

`npm run verify-examples` reports mismatches for all five historical expected audit JSON
files: audit-output-sample, query-assist, query-unresolved, framework-requires-and,
confidence-propagation. Those expected files lack current report metadata such as
grammar_version. The pre-change captured reports already differ from them, and the final
reports equal the captured baseline. No expected JSON was rewritten to hide this drift.

## Phase review boundary

| Classification   | Finding and disposition                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| INSIDE           | Approved reference separation, unknown causes, opt-in audit and old-document behavior are implemented and locally verified.                                  |
| INSIDE           | Structural findings and review_required prompts are distinct; claims of truth, coverage sufficiency, execution authority and recovery are excluded.          |
| OUTSIDE          | Refreshing pre-existing stale expected audit JSON is separate maintenance; preserved output equality establishes this extension's non-regression.            |
| OUTSIDE          | Alias/macro syntax, the separate generic V2 runtime, real-world verification and distribution/installation are not delivered by this change.                 |
| BOUNDARY_DISPUTE | None identified for this additive extension; the separate accepted V2 requirements and unaccepted RCA work remain preserved rather than implicitly replaced. |

The SealGraph path manifest alongside this record identifies the contract and ADR bytes.
It is a path/digest provenance claim, not proof of correctness, review independence or owner acceptance.

## Planning actuals

IMPLEMENT was measured from 2026-11-06 14:37:27.840768 to 14:55:21.231098 JST:
0.298164 elapsed hours for its declared 4 points. The plan records the exact observed
elapsed-throughput token as a low-confidence, one-sample planning value, not active effort
or a forecast for unrelated tasks. Both lifecycle events are retained in the plan.
Velocity observation exposed that candidate as available, while reporting Git history
unavailable because this new plan is not committed; no Git-recorded provenance or effort
measurement is claimed. No commit was created to satisfy the observation.

## Review corrections — 2026-11-06

Owner follow-up: 「修正をお願いします。」 refers to the two P2 findings in this chat.

- Quoted relation mechanisms now decode JSON escapes. The relation formatter preserves
  quoted form, including leading/trailing escaped newlines, rather than routing those values
  through block-text whitespace normalization. Invalid escapes fail with a source ParseError.
  Legacy text fields are unchanged.
- Cause existence and impact existence now use one multi-source forward traversal and one
  multi-source reverse traversal per audit. Results are audit-local; refuted links remain
  excluded, cycles terminate, and individual branch findings are preserved.
- Added regressions for quotes, backslashes, control characters, boundary whitespace,
  repeated formatting, invalid escapes, shared/refuted branches and 320-cause/320-phenomenon input.
- The same 73,494-byte benchmark used in review measured 6,340ms before and 24ms after
  on this host, one measurement each. This is a local observation, not a portable latency guarantee.
- Final full test run: 289 passing (Core 132, contracts workspace 11, root conformance 17,
  Server 67, application 62), zero failures, under Node.js 24.19.0 with the existing browser.
- Final root build, extension bundle build, lint, deadcode and formatting checks passed.
  The 36-document legacy AST/format/raw-audit comparison still matches the captured baseline.
- The pre-existing expected-JSON and local perttool dependency limitations above remain unchanged.

After the review correction task finished, the plan's declared elapsed-throughput value was
refreshed using both recorded task lifecycles. The one-sample paragraph above records the
initial implementation observation, not the final combined planning value.
