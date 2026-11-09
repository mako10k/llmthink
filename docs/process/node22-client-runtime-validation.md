# Node 22 client/runtime boundary verification

Date: 2026-11-09
Validation stage: 1.4.1 candidate, before publication. Later publication is recorded in
[release-1.4.1.md](release-1.4.1.md) and its external receipt.
Branch: codex/node22-client-runtime, based on a22751649809958d31934ef1f4a056343ba8b036
Decision: [ADR-0026](../adr/0026-client-and-sqlite-runtime-boundaries.md)
Plan: [node22-client-runtime.pert](../../plans/node22-client-runtime.pert)

## Accepted scope

「CLI・MCP・LSPの利用にServerのNode制約が及ばないよう、配布構成を見直してください。
既存API・binの互換性を保ち、Node 22での動作も確認してください。」

The root's mandatory Server dependency is retained for existing Hosted API/bin exports.
The Server package's general engines baseline is >=22.16.0, while the existing SQLite
constructor range remains >=24.15.0 <25.0.0. The native driver is loaded after that guard,
using a builtin-only createRequire anchored at process.execPath so ESM and CJS bundles work.
No optional install, peer dependency, configuration prerequisite or new runtime gate was added.
The previous package-wide Node 24 declaration and eager SQLite import were the producing
conditions; local checks using other Node versions did not establish Node 22 compatibility.

## Consumer evidence

Both Node 22.16.0 (the owner's reported version) and Node 22.22.3 passed independent root-only
installs of the four exact candidate tarballs through a disposable loopback registry, with
engine-strict enabled. User/global npm configuration files were empty in the fixture. The
22.16.0 runtime came from nodejs.org and its tarball matched the official SHASUMS256.txt.
These were Linux x64/WSL tests; no system Node selection or installed client was changed.

Each packed install verified:

- All four package versions are 1.4.1, without workspace links or Server engine rejection.
- The actual npm-created CLI command performs a relation DSL check; quick/query/sample HELP
  resolves the new syntax and bundled examples outside the repository.
- Stdio MCP initializes with 1.4.1 and returns updated HELP.
- LSP initializes and provides family-specific completion and definition navigation.
- Every published root bin name resolves to an executable npm bin link; both root and standalone
  Server Hosted entries start their existing file-backed service on a temporary loopback port.
- Public root and Server export-name sets match the 1.4.0 baseline exactly. All 13 root and 13
  Server declaration files match the published 1.4.0 tarballs byte-for-byte. Bin mappings are
  unchanged. Package version constants intentionally advance to 1.4.1.

The import regression blocks both ESM and CommonJS attempts to load node:sqlite, imports root
and Server, and verifies the existing Node 24 error when constructing SQLite on Node 22.
It passes on Node 22.16.0 and Node 24; it does not substitute a mock driver for SQLite execution.

## Regression evidence

- Node 22.16.0: Core 132, application 69, non-SQLite Server 55 tests passed.
- Node 24.19.0: full suites passed (Core 132, Contracts 11, root conformance 20, Server 67,
  application 69; 299 executions, including conformance repeated by application).
- The final CJS-compatible loader-anchor adjustment was followed by a focused Node 24 rerun
  of all 12 SQLite tests plus the public import test (13 passed), another Node 22 import test,
  and fresh final-tarball consumer checks on both Node 22 versions. The earlier full run used
  the same deferred-load behavior with the original ESM anchor; the final targeted run tests
  the changed native-driver loading line.
- Root and extension builds/typechecks, lint, formatting, deadcode and all five example checks
  passed. Final extension build has no empty-import-meta warning. VSIX 1.4.1 is generated;
  this is a local candidate, not an installed or published editor update.

CLI CI now runs Node 22.16.0, 22.x and 24.x, installs with engine-strict, verifies public import
and local protocol entrypoints, then packs and runs the isolated install smoke. This workflow
change is configured locally; it has not been pushed or executed on GitHub in this task.

## Limits and delivery

SQLite migrations, transactions and the existing Node 24 constraint remain unchanged. General
Server APIs and its file-backed bin were checked on Node 22; this is not a Hosted deployment,
WorkOS/Plugin rollout or certification of every service configuration.

At the end of implementation, these source changes and artifacts were an unpublished 1.4.1
candidate; the installed CLI/VSIX remained 1.4.0. The later publication request is recorded
separately; installation updates remain separate owner actions.
The external artifact receipt records source hashes, candidate package integrities, runtime
results and checks. The candidate receipt identifies the worktree at verification time; the later publication
receipt binds the final release commit and final public documentation.

PERT points are provisional estimates. Lifecycle events measure elapsed time, including tool
waits; the derived low-confidence throughput is not active effort or a general forecasting rate.
Untracked plan history is not represented as Git-recorded evidence.
