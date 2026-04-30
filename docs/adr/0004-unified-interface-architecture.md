# ADR-0004: CLI MCP VSIX を共通監査 API に統一する

## Status

accepted

## Date

2026-04-30

## Context

- 思考監査エンジンは CLI、MCP、VSIX の 3 つの入口から使いたい
- UI ごとに監査ロジックを重複させると、結果の差異と保守コストが増える
- 監査ロジックは UI よりも先に確定しており、共通コアとして扱える
- CLI はバッチ利用、MCP は LLM 連携、VSIX は対話的な編集体験に向く

## Decision

インターフェース構成は、共通監査 API を中心にして、その上に CLI、MCP、VSIX の 3 つの薄い UI 層を載せる。

採用方針は次のとおりとする。

- 監査ロジックは root package の TypeScript 実装に集約する
- CLI は共通 API を直接呼ぶ
- MCP サーバは stdio transport を使い、tool 経由で共通 API を呼ぶ
- VSIX 拡張は active editor のテキストを共通 API に渡す
- UI 固有の整形は許可するが、監査結果の意味は変えない

## Alternatives Considered

- UI ごとに独自実装する
  - 実装速度は一時的に高いが、結果の不一致と保守負担が増えるため不採用
- MCP を主入口にして CLI と VSIX をそのクライアントにする
  - 構造は揃うが、ローカル CLI と拡張の最小運用までサーバ起動を前提にしてしまうため不採用
- VSIX を主入口にして CLI と MCP を後回しにする
  - 編集体験は作れるが、自動化と LLM 連携の要件を先送りするため不採用

## Consequences

- core API の安定性が重要になる
- UI 層は薄く保つ必要がある
- root package と VSIX 拡張のビルド導線を分ける必要がある
- MCP 用の依存と VS Code 拡張用の依存が増える

## Auditability Notes

- UI ごとに監査結果差異が出始めた場合に再評価する
- 共通 API が UI 固有事情で複雑化し始めた場合に再評価する
- 将来 Web UI を追加する場合も同じ原則に従う
