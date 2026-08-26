# ADR-0017: Hosted lifecycle driverにNode.js組込みSQLiteを限定採択する

## Status

accepted

## Date

2026-08-26

## Decision Owner

Repository owner（Issue #28の実施と同時アクセス制御の重点確認を承認）

## Context

- ADR-0012はaccount lifecycle control planeにSQLiteを採用したが、Node.js driverは固定していなかった
- lifecycle実装は`node:sqlite`の`DatabaseSync`を使用し、Node.js v24.19.0のisolated Stageで検証済みである
- Node.js v24.19.0はLTSであり、同versionの`node:sqlite`はStability 1.2（Release Candidate）である
- `node:sqlite`のAPIは同期実行である。短いcontrol-plane transactionには単純だが、lock待機中はcallerのthreadを停止する
- SQLite WALはreaderとwriterを並行実行できるが、同時writerは一つだけである
- 現行用途はaccount、同意、tenant/workspace catalog、scope、recovery、outboxであり、thought本文や大容量mediaを保存しない
- Issue #28はdriver/runtime、native packaging、backup、安全設定、同時アクセスの残存判断をStage activation前のgateとして登録した。Stage試験自体は既に限定権限下で実施されたため、本ADRは残存governance gapを閉じるが、過去または将来のactivation権限を拡張しない

## Decision

Hosted lifecycle SQLite driverには、Node.js組込みの`node:sqlite`を採用する。

### Runtime boundary

- lifecycle authorityを有効化できるNode.js runtimeは`>=24.15.0 <25.0.0`とする
- accepted Stage baselineはNode.js `v24.19.0`とする
- `node:sqlite`をRelease Candidateへ引き上げた`v24.15.0`を下限とする
- Node.js major versionの変更、`node:sqlite`のStability後退、またはSQLite libraryの互換性問題は再評価gateとする
- lifecycleを使わないlocal DSL、CLI、LSPまで同じNode rangeへ制限しない

### Connection safety profile

各lifecycle connectionは次を必須とする。

- extension loading: disabled and re-enable不可
- defensive mode: enabled
- double-quoted string literal compatibility: disabled
- unknown/bare named parameter compatibility: disabled
- foreign keys: enabled
- journal mode: WAL（in-memory testのみmemory）
- synchronous: FULL
- trusted schema: disabled
- recursive triggers: disabled
- busy timeout: 5000msを既定値とし、1ms以上60000ms以下だけを受理

### Concurrent access contract

- write transactionは`BEGIN IMMEDIATE`で開始し、変更前にsingle-writer lockを取得する
- readerはWAL snapshotを読み、短時間のwriterと並行できる
- writer競合はSQLite busy handlerがconnectionごとのtimeoutまで待機する
- application層のblind retryは0回とする。timeout後は`lifecycle_database_busy`としてfail closedにする
- HTTP onboardingではbusyを400や成功へ変換せず、`503 Service Unavailable`と`Retry-After: 5`を返す
- callerによる明示再実行は、provisioning operationの一意制約、identityの一意制約、既存readbackによって冪等に処理する
- transaction中の例外ではtransactionが残っている場合だけ明示rollbackする。rollback自体に失敗した場合は元のerrorとrollback errorの両方を保持して停止する
- 同一databaseをnetwork filesystemや複数hostからwriteしない

### Backup and operational boundary

- backupは`node:sqlite`のonline backup APIを使い、生成物をowner-onlyにしてintegrity、foreign key、schema versionを検証する
- database、WAL、SHM、backupは同じ機密区分で扱う
- WALのcheckpoint状況、busy発生、transaction時間、event-loop遅延をProduction候補の観測対象とする
- 継続的なbusy、長時間transaction、複数host writer、高頻度writeが必要になった場合はdriver交換だけで解決したとみなさず、database architectureを再評価する

## Alternatives Considered

### `better-sqlite3`

- full transaction、WAL、worker threadを扱える成熟した同期driverであり、技術的には成立する
- 一方、native addon、prebuilt binaryのplatform/ABI被覆、install scriptまたはlocal build、Node更新時の再検証が必要になる
- 現行の低頻度・短時間control-plane workloadでは、既存Stage実績を捨ててこの運用負担を追加する具体的利益が確認できないため不採用とする
- `node:sqlite`の回帰、必要APIの欠落、supported Node runtimeとの不整合が発生した場合の第一比較候補として残す

### `sqlite3` / async wrapper

- callback/async APIを提供できるが、SQLite内部のsingle-writer制約は変わらず、既存同期repositoryを全面変更する利益がないため不採用とする

### PostgreSQL等のnetwork database

- 複数host writerや高いwrite concurrencyには適する
- 現時点ではnetwork、credential、service availability、migration、backup、tenant運用のfailure modeを追加し、bounded single-host trialの要件を超えるため不採用とする

## Consequences

### Good

- Node.js LTSに含まれるため、追加のProduction native dependencyとinstall scriptが不要になる
- 現行schema、backup、Stage evidenceを維持できる
- `BEGIN IMMEDIATE`と一意制約により、同時初回provisioningを変更前に直列化できる
- busy timeoutとHTTP 503により、lock競合を成功やvalidation errorへ誤分類しない

### Bad / Risk

- `node:sqlite`はStability 2ではなくRelease Candidateである
- 同期APIのbusy waitは最大5秒caller threadを停止し得る
- WALでもwriterは同時に一つだけであり、高write量には適さない
- Node 25以降をlifecycle runtimeへ自動採用できず、upgradeごとに再評価が必要になる

### Neutral

- SQLite自体、schema、repository port、thought data planeとの分離はADR-0012から変更しない
- Production activation、public enrollment、billing、lifecycle databaseへのthought本文保存を許可しない

## Implementation Notes

- `SqliteLifecycleStore`でNode rangeとbusy timeoutを検査する
- `DatabaseSync` constructor optionでtimeoutと安全設定を明示する
- 全writeを`BEGIN IMMEDIATE` transactionへ統一する
- busy errorをstable domain errorへ正規化し、onboardingで503へ変換する
- 同一identityの同時commit試験に加え、lock timeout、部分rowなし、lock解放後の明示再実行を試験する
- Stage baselineは`docs/process/stage-lifecycle-acceptance-evidence.md`、判断過程は`docs/process/sqlite-driver-selection.dsl`を参照する

## Review

- Specialist review: Node.js v24.19.0 SQLite API、SQLite WAL/transaction/busy仕様、`better-sqlite3`の公式READMEとrelease情報を比較
- Non-specialist review: SQLiteの用途がthought本文でなくhosted account lifecycleであることをownerへ説明済み
- Root-chain review: ADR-0012のstorage authorityを変更せず、Issue #28のdriver残件だけを閉じる

## Traceability

### Claims

- C-0017-01: Node.js v24.19.0上の`node:sqlite`はbounded single-host lifecycle workloadに必要なtransaction、timeout、backup、安全設定を提供する
- C-0017-02: WAL、`BEGIN IMMEDIATE`、bounded busy timeout、一意制約、明示再実行により同時writerをatomicかつfail-closedに扱える
- C-0017-03: `better-sqlite3`のnative packaging負担を追加する利益は現行workloadでは立証されていない

### Evidence

- E-0017-01: [Node.js v24.19.0 SQLite documentation](https://nodejs.org/docs/v24.19.0/api/sqlite.html)
- E-0017-02: [SQLite WAL concurrency documentation](https://www.sqlite.org/wal.html)および[transaction documentation](https://www.sqlite.org/lang_transaction.html)
- E-0017-03: [better-sqlite3 official README](https://github.com/WiseLibs/better-sqlite3)と[releases](https://github.com/WiseLibs/better-sqlite3/releases)
- E-0017-04: `docs/process/stage-lifecycle-acceptance-evidence.md`のNode.js v24.19.0・独立connection同時provisioning結果
- E-0017-05: `test/server/sqlite-lifecycle-store.test.ts`と`test/server/onboarding.test.ts`のconcurrency/busy回帰試験

### Actions

- A-0017-01: runtime range、constructor timeout、安全profileを実装する
- A-0017-02: transaction cleanupとbusy domain errorを実装する
- A-0017-03: onboardingのretryable 503と同時アクセス回帰試験を実装する
- A-0017-04: deployment/runtime文書とIssue #28を本ADRへ同期する

## Auditability Notes

- Node.js range、driver、busy timeout、安全PRAGMA、transaction modeのいずれかを変更する場合は本ADRを再評価する
- `SQLITE_BUSY`頻度、p95/p99 transaction時間、WAL size、checkpoint停滞、event-loop delayをProduction候補判断の証拠とする
- lock timeoutを暗黙成功、400 validation error、無制限retryへ変換した場合はdefectとする
- user承認はIssue #28の実施と同時アクセス重点確認に限定され、deployment、Production activation、public enrollmentを含まない

## Follow-ups

- Production activationを提案する場合は、実workloadでbusy、WAL、event-loop delayを計測し、driver継続可否を別gateで確認する
- Node 25以降へ移行する場合は`node:sqlite` stability、bundled SQLite version、backup/defensive/timeout挙動を再検証する
