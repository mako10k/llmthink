# ADR-0022: Hosted lifecycle driverにNode.js組込みSQLiteを限定採択する

## Status

accepted

## Date

2026-09-07

## Decision Owner

Repository owner（Issue #28でSQLite採用と同時アクセス制御の重点確認を承認）

## Context

- Issue #29はHosted serverをCoreやPluginから分離し、lifecycle control planeをServer境界へ移す方針を固定している
- ADR-0019はSQLite lifecycleをOAuth、backup、operationsと分けたbounded migrationとして残した
- retained WIP `c205a7d`にはIssue #28で受け入れられたNode SQLite driver判断、実装、同時アクセス試験がある
- current mainではServer workspaceが後継ownership boundaryになっているため、WIP全体のmergeではなくこの判断と実装だけを適応する必要がある
- 対象データはaccount、同意、tenant/workspace catalog、scope、recovery、realization outbox、およびarchive/retention metadataであり、thought本文やbackup artifactではない
- managed OAuth、browser onboarding、HTTP adapter、backup/archive/restore、deployment、Production activationは別の未完了migrationである

## Decision

Hosted lifecycle SQLite driverには、Node.js組込みの`node:sqlite`を採用する。

### Runtime boundary

- lifecycle control planeを含む`@llmthink/server`のNode.js runtimeは`>=24.15.0 <25.0.0`とする
- accepted verification baselineはNode.js `v24.19.0`とする
- runtime assertionとServer package engineを同じrangeへ固定する
- Node.js major versionの変更、`node:sqlite`のstability後退、またはbundled SQLiteの互換性問題は再評価gateとする
- lifecycleを含まないCore、local CLI、LSPまで同じNode rangeへ制限しない

### Connection safety profile

各lifecycle connectionは次を必須とする。

- extension loadingを無効にし、defensive modeを有効にする
- double-quoted string literal、bare/unknown named parameter互換を無効にする
- foreign keysを有効にする
- journal modeをWALとする（in-memory testのみmemoryを許可する）
- synchronousをFULL、trusted schemaとrecursive triggersを無効にする
- busy timeoutは5000msを既定値とし、1ms以上60000ms以下だけを受理する
- file databaseは絶対path、owner-onlyまたは明示的なgroup-readable regular file、non-symlinkとする

### Concurrent access contract

- write transactionは`BEGIN IMMEDIATE`で開始し、変更前にsingle-writer lockを取得する
- writer競合はconnectionのbounded timeoutまで待機する
- application層のblind retryは行わず、timeout後は`lifecycle_database_busy`としてfail closedにする
- callerによる明示再実行はprovisioning operationとexternal identityの一意制約、および既存readbackにより冪等に扱う
- transaction中の例外ではactive transactionだけをrollbackする。rollbackも失敗した場合は元のerrorとrollback errorを保持して停止する
- 同一databaseをnetwork filesystemや複数hostからwriteしない

### Ownership boundary

- SQLite層のexternal identityとresolved account contextはtransport-neutral Server interfaceで表す
- SQLite層はOAuth/JWT implementation、HTTP request、root application implementationをimportしない
- lifecycle schemaにはarchive receiptとretention transitionのmetadataを含めるが、backup/archive/restore処理は実装しない
- `lifecycle_database_busy`のHTTP `503 Service Unavailable`への写像はbrowser onboarding/HTTP adapter migrationで実装し、SQLite driverの受入完了条件へ混ぜない

## Alternatives Considered

### `better-sqlite3`

- transactionとWALを扱える成熟した同期driverであり技術的には成立する
- native addon、platform/ABI別binary、install scriptまたはlocal build、Node更新時の追加検証が必要になる
- boundedなsingle-host control-plane workloadでは、その運用負担を追加する具体的利益が確認できないため採用しない
- `node:sqlite`の回帰、必要APIの欠落、supported runtimeとの不整合が生じた場合の第一比較候補として残す

### `sqlite3`またはasync wrapper

- async APIは提供できるがSQLite内部のsingle-writer制約は変わらず、既存の短い同期transactionを全面変更する根拠がないため採用しない

### PostgreSQL等のnetwork database

- 複数host writerや高いwrite concurrencyには適する
- 現時点ではnetwork、credential、availability、migration、backup運用のfailure modeを増やし、bounded single-host lifecycleの要件を超えるため採用しない

## Consequences

Good:

- Server lifecycleに追加のProduction native dependencyとinstall scriptが不要になる
- `BEGIN IMMEDIATE`と一意制約により、同時初回provisioningを変更前に直列化できる
- busy timeoutをstable domain errorへ正規化し、lock競合を成功やvalidation errorへ誤分類しない
- OAuth、HTTP、backup実装と分けてstorage/concurrency境界をfocused testできる

Bad / Risk:

- 同期APIのbusy waitは最大5秒caller threadを停止し得る
- WALでもwriterは同時に一つだけであり、高write量には適さない
- Node 25以降をServer lifecycleへ自動採用できず、upgradeごとに再評価が必要になる
- HTTP 503 mapping、busy/WAL/event-loopの運用観測、backup/restoreはまだ提供しない

Neutral:

- thought data plane、Production activation、public enrollment、billingのauthorityは変更しない
- archive receiptは外部で生成されたartifactのmetadataであり、artifact生成やbackup成功の証拠にはならない

## Implementation Notes

- implementation: `packages/server/src/sqlite-lifecycle-store.ts`
- transport-neutral identity boundary: `packages/server/src/lifecycle-identity.ts`
- focused tests: `packages/server/test/sqlite-lifecycle-store.test.ts`
- ownership/runtime boundary test: `test/contracts/server-package-boundary.test.ts`
- retained source provenance: `work/trial-lifecycle-terms-20260820@c205a7d`
- task issue: [#29](https://github.com/mako10k/llmthink/issues/29)

## Review

- Driver review: runtime range、constructor safety options、PRAGMA readbackを実装とtestで照合する
- Concurrency review: two-writer provisioning、busy timeout、partial rowなし、lock解放後の明示再実行を検証する
- Boundary review: SQLite層がOAuth/JWT、HTTP request、root implementation、backup APIへ依存しないことを検証する
- Authority review: deployment、Production activation、publication、release、WIP削除を実行していないことを確認する

## Traceability

### Claims

- `C-0022-01`: Node.js v24.19.0の`node:sqlite`はbounded single-host lifecycleに必要なtransaction、timeout、安全設定を提供する
- `C-0022-02`: WAL、`BEGIN IMMEDIATE`、bounded busy timeout、一意制約、明示再実行により同時writerをatomicかつfail closedに扱える
- `C-0022-03`: SQLite lifecycleはOAuth transportとbackup implementationから独立したServer ownership boundaryに置ける

### Evidence

- `E-0022-01`: [Node.js v24.19.0 SQLite documentation](https://nodejs.org/docs/v24.19.0/api/sqlite.html)
- `E-0022-02`: [SQLite WAL documentation](https://www.sqlite.org/wal.html)および[transaction documentation](https://www.sqlite.org/lang_transaction.html)
- `E-0022-03`: `packages/server/src/sqlite-lifecycle-store.ts`のruntime assertion、connection profile、transaction wrapper、schema migration
- `E-0022-04`: `packages/server/test/sqlite-lifecycle-store.test.ts`のconcurrency、busy、rollback、identity、migration test
- `E-0022-05`: `test/contracts/server-package-boundary.test.ts`のServer ownershipとtransport/backup dependency検査
- `E-0022-06`: retained WIP `c205a7d`のIssue #28受入判断と実装provenance

### Actions

- `A-0022-01` (`C-0022-01`): runtime range、constructor safety profile、schema migrationをServer workspaceへ実装する
  - Status: implemented in this migration candidate
- `A-0022-02` (`C-0022-02`): transaction cleanup、busy domain error、concurrent writer回帰試験を実装する
  - Status: implemented in this migration candidate
- `A-0022-03` (`C-0022-03`): lifecycle identity/context interfaceをtransport-neutralにし、backup APIを含めない
  - Status: implemented in this migration candidate
- `A-0022-04` (`C-0022-02`): onboarding HTTP adapterでbusy errorをretryable 503へ写像する
  - Status: pending under Issue #29

## Auditability Notes

- Node.js range、driver、busy timeout、安全PRAGMA、transaction modeのいずれかを変更する場合は本ADRを再評価する
- `SQLITE_BUSY`頻度、p95/p99 transaction時間、WAL size、checkpoint停滞、event-loop delayはProduction候補判断で別途観測する
- lock timeoutを暗黙成功、400 validation error、または無制限retryへ変換した場合はdefectとする
- archive receipt metadataをbackup/archive/restoreの完了証拠として扱った場合はownership boundary違反とする
- Issue #28の受入はdriverと同時アクセス制御に限定され、deployment、Production activation、public enrollmentを認可しない

## Follow-ups

- managed OAuth、browser onboarding/account registryとHTTP 503 mappingを別migrationとして接続する
- backup/archive/restore implementationとoperations evidenceを別migrationとして移す
- Node 25以降へ移行する場合は`node:sqlite` stability、bundled SQLite version、安全option、timeout挙動を再検証する
