# ADR-0026: Local-client and SQLite runtime boundaries

- Status: Accepted
- Date: 2026-11-09
- Owner: repository owner (explicit implementation request in this chat)
- Supersedes: ADR-0022's package-wide Node 24 runtime scope only
- Preserves: ADR-0025's four individually published packages and root API/bin compatibility

## Context and owner agreement

「CLI・MCP・LSPの利用にServerのNode制約が及ばないよう、配布構成を見直してください。
既存API・binの互換性を保ち、Node 22での動作も確認してください。」

C1: A root installation inherits engines from its mandatory Server dependency. Evidence E1:
1.4.0 root package.json pins Server, whose engines.node is >=24.15.0 <25.0.0; the owner observed
EBADENGINE under Node 22.16.0. E2: Server's index exports sqlite-lifecycle-store, which eagerly
imports node:sqlite, while its constructor already enforces that narrower SQLite runtime.
The earlier local checks used Node 24 or 25 and did not establish Node 22 compatibility.

## Decision

C2: Keep the four-package dependency graph, all existing exports, synchronous constructors and
bin names/paths. Server's general package/runtime baseline becomes Node >=22.16.0, verified with
22.16.0 and a later 22.x release. No optional install, peer dependency, stub, asynchronous API
replacement or additional configuration prerequisite is introduced.

C3: Retain the exact existing SQLite constructor range >=24.15.0 <25.0.0. Import SQLite types
only; load the native driver synchronously after the constructor's existing version check.
Normal root/Server imports and CLI/MCP/LSP usage must not load SQLite. Other Hosted APIs retain
their previous implementation. This does not claim SQLite or every Hosted deployment works on
Node 22, nor change the lifecycle database, migrations or access controls.

## Alternatives

Removing Server from root dependencies would break its existing Hosted exports/bin. Optional
or peer dependencies would make existing APIs contingent on another installation. Bundling
Server into root would reverse the accepted individual-package approach and duplicate delivery.
A metadata-only relaxation would leave eager native loading and fail to establish the boundary.
The selected correction changes the package-wide declaration and the actual load boundary.

## Implementation and verification

A1 -> C2/E1: Server manifest, exact aligned 1.4.1 candidate versions, lockfiles and package smoke.
A2 -> C3/E2: sqlite-lifecycle-store uses type-only imports and a deferred createRequire load.
A3 -> C2/C3: import regression blocks both ESM and CommonJS SQLite loads, compares 1.4.0 public
export names and bin mappings, and checks the existing SQLite error on Node 22. Node 24 runs the
full lifecycle suite. Actual packed root-only installs use engine-strict and exercise CLI, stdio
MCP and LSP under Node 22.16.0 and a later 22.x version outside the checkout.

## Consequences, review and follow-ups

Existing root/Server APIs and bin paths remain available without an extra installation step.
SQLite users still need the previously required Node 24 runtime. The root retains its existing
Server dependency size; reducing size is outside this compatibility repair.

The current review obligation is Node 22 client installation/execution and API/bin preservation.
Publication, installed-client rollout and Hosted deployment are subsequent owner actions.
Verification results and limits belong in the runtime validation record; acceptance of this
implementation direction is not evidence of a passing runtime test or authorization to publish.
