# ADR-0007: Hosted server は共通 Application Service を公開する

## Status

proposed

## Date

2026-08-18

## Context

- ADR-0004 は CLI、stdio MCP、VSIX が共通監査 API を使う構成を採用している
- 現行 MCP は transport、入力検証、表示、thought store 操作を一つの module で扱っている
- hosted server では REST API、Streamable HTTP MCP、認証、認可、競合制御が必要になる
- REST から MCP、または MCP から REST を呼ぶ直列構成は、一方の transport 契約を内部 API にしてしまう
- ローカル CLI と VSIX は server 起動を必須にしてはならない

## Decision

hosted server の中心に transport 非依存の Application Service を置く。

- Core は parse、format、audit、DSLQL と thought lifecycle の意味規則を所有する
- Application Service は command/query、認可要求、transaction boundary、revision 検査を調停する
- REST、Streamable HTTP MCP、stdio MCP、CLI、VSIX は Application Service を呼ぶ adapter とする
- adapter は入出力変換と transport 固有 metadata を扱えるが、監査結果や状態遷移の意味を変更しない
- MCP と REST は並列の公開 adapter とし、相互の loopback 呼び出しを行わない
- hosted server の導入後も CLI、stdio MCP、VSIX のローカル実行を維持する

## Alternatives Considered

- REST API を正本にして MCP、CLI、VSIX が HTTP 経由で呼ぶ
  - interface は一つになるが、ローカル利用まで server、network、認証へ依存するため不採用
- Streamable HTTP MCP を唯一の server interface にする
  - LLM client との統合は単純になるが、管理、batch、非 LLM client 用の安定した API が不足するため不採用
- 現行 module へ HTTP transport を直接追加する
  - 初期差分は小さいが、transport、表示、永続化、認可の責務がさらに集中するため不採用

## Consequences

- Application Service の command/query contract を新たに設計して保守する必要がある
- 現行 store 関数を直接呼ぶ CLI と MCP は段階的な adapter 化が必要になる
- REST と MCP の schema が異なっても同じ use case と状態遷移を共有できる
- transport ごとの差異を contract test で検出できる
- server 実装だけでは既存ローカル adapter の置換は完了しない

## Auditability Notes

- adapter ごとに監査結果または状態遷移の差異が生じた場合に再評価する
- Application Service が HTTP や MCP SDK の型へ依存し始めた場合に再評価する
- ローカル利用を server 必須へ変更する提案が出た場合に再判断する
- 実装受入時は同一 use case の REST、MCP、direct call contract test を比較する
