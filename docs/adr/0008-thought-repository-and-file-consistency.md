# ADR-0008: Thought 永続化を Repository Port と revision 契約で分離する

## Status

proposed

## Date

2026-08-18

## Context

- 現行 thought store は process-local な同期 file I/O と複数 JSON/THINK file で構成される
- hosted server では同時更新、部分書き込み、tenant 間 path 混在への対策が必要になる
- 最初の server backend は file とするが、将来 DB、refgraph-core、sealgraph を評価したい
- file layout や DB table を Application Service の contract にすると backend 交換が困難になる
- graph backend が record の正本、検索 projection、provenance のどれを担うかは未確定である

## Decision

Thought 永続化を domain operation 単位の `ThoughtRepository` port として分離し、すべての更新に revision 契約を適用する。

- repository key は server が確定した `tenantId`、`workspaceId`、`thoughtId` の組とする
- client が送った file path や workspace path を repository key として信用しない
- snapshot は単調増加する `revision` を持つ
- 更新 command は `expectedRevision` と任意の idempotency key を受ける
- file backend は同一 thought の書き込みを直列化し、immutable revision directory と atomic `CURRENT` pointer を用いる
- event、reflection、audit record は追記履歴として保持し、snapshot の上書きだけを履歴にしない
- incomplete temporary revision と `CURRENT` が指さない orphan revision は未 commit として読まず、自動昇格させない
- idempotency は subject、operation、resource、request digest で scope し、既定24時間、設定可能範囲1時間から7日とする
- server の process cwd を tenant または workspace 解決に用いない
- backend 固有の path、table key、graph node ID を公開 API の identity にしない
- DB、refgraph-core、sealgraph の採否と、正本または projection の役割は別 ADR まで未決とする

## Alternatives Considered

- 現行 file store 関数をそのまま server から呼ぶ
  - local single-process では単純だが、競合、tenant 分離、部分更新の契約がないため不採用
- file CRUD を抽象 interface にする
  - backend API は隠せるが、domain transaction と整合性条件を表現できないため不採用
- 最初から graph store を唯一の正本にする
  - 将来像には近いが、refgraph-core と sealgraph の責務および transaction 契約が未確定なため不採用
- 最初から SQL database のみを実装する
  - concurrency は扱いやすいが、最初の file backend で use case と port を検証する要求から外れるため不採用

## Consequences

- file backend にも server 用の locking、immutable revision、recovery、migration test が必要になる
- 既存 local store と server file store は同じ format を部分共有しても、同じ安全性 contract とはみなせない
- backend contract test により DB や graph adapter を追加できる
- revision conflict は利用者に明示的な error として返る
- file backend は multi-process や network filesystem に対する無制限な scalability を提供しない

## Auditability Notes

- multi-process 配置または network filesystem が必要になった時点で file locking 前提を再評価する
- DB、refgraph-core、sealgraph の PoC では正本、index、projection、provenance の役割を明示して比較する
- revision を経由しない更新 path が追加された場合は contract violation として扱う
- crash recovery test で partial snapshot または event 欠落が観測された場合に write protocol を再判断する
