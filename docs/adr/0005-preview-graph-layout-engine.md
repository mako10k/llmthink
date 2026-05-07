# ADR-0005: VSIX preview graph の layout engine に ELK を採用する

## Status

proposed

## Date

2026-05-07

## Context

- VSIX preview で DSL の step 関係を有向グラフとして表示したい
- 現在の preview graph は role ごとの lane を維持したいという要件がある
- node の可読性だけでなく、edge が node を横切らず理解しやすいことが重要である
- source reveal、theme 追従、custom editor の導線は現行 preview と整合している必要がある
- webview 内で完結し、VS Code 拡張バンドルに収まる JavaScript 実装が必要である

## Decision

VSIX preview graph の layout engine は ELK を第一候補として採用する。

採用方針は次のとおりとする。

- SVG 自体は引き続き拡張側で生成する
- node 配置と edge routing は ELK に委譲する
- graph は role ごとの lane を保つ前提でモデル化する
- click reveal、theme 追従、node copy clamp は現行 custom editor 契約を維持する
- 切り替え完了までは ADR の状態を proposed とし、実装と見た目の検証後に accepted を検討する

## Alternatives Considered

- dagre を継続利用する
  - layered graph の node 配置には向くが、障害物回避付きの orthogonal edge routing が責務外であり、手実装補正が増えて線の可読性が下がるため不採用
- mermaid を使う
  - 導入初速は高いが、lane 制約、node クリックによる source reveal、LLMThink 固有の node 表現の制御粒度が不足するため不採用
- Graphviz 系を使う
  - 表現力はあるが、webview 組み込みの運用とインタラクション統合でコストが高く、拡張内完結性を損なうため不採用

## Consequences

- preview graph の依存は dagre から ELK へ置き換わる
- graph モデルと layout 結果を結ぶ変換層が必要になる
- lane 制約、port 制約、label overflow の微調整が残る
- routing 品質は改善しやすくなるが、初期実装の複雑さは上がる

## Auditability Notes

- edge が node を横切る、または lane 意図を壊す場合は再評価する
- webview バンドルサイズや実行性能が悪化した場合は再評価する
- click reveal や theme 追従が壊れる場合は UI 契約維持方針を再評価する
- ELK への移行完了後に status を accepted へ更新するか判断する