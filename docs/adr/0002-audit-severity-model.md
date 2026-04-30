# ADR-0002: 監査重大度モデルを fatal error warning info hint に固定する

## Status

accepted

## Date

2026-04-30

## Context

- 思考監査エンジンは、矛盾、契約違反、MECE不備、補助的意味情報を同時に扱う
- 監査結果は一種類ではなく、解釈不能、明確な違反、疑義、補足、参考情報を分離する必要がある
- severity が曖昧だと、どこから修正すべきか利用者が判断しにくい
- query_result や semantic_hint は主機能ではなく補助出力である

## Decision

監査結果の重大度モデルを次の 5 段階に固定する。

- fatal
- error
- warning
- info
- hint

運用方針は次のとおりとする。

- fatal は DSL の解釈継続が困難な状態に使う
- error は明確な矛盾または契約違反に使う
- warning は矛盾候補、MECE 不備候補、根拠不足候補に使う
- info は再読支援や確定度調整に使う
- hint は意味論的距離、関連候補、query_result のような参考出力に使う

## Alternatives Considered

- fatal error warning の 3 段階にする
  - 単純だが、補助情報と疑義の区別が粗くなり、思考監査の説明性が落ちるため不採用
- critical high medium low の汎用モデルにする
  - 一般的だが、思考監査特有の意味を直接表しにくく、query_result の扱いも曖昧になるため不採用
- score ベースだけで順位付けする
  - 重大度の意味が不明瞭になり、明確な契約違反と参考情報が同じ軸に混ざるため不採用

## Consequences

- 監査結果スキーマと requirements がこの 5 段階に依存する
- 実装ではカテゴリと重大度を分離して判断する必要がある
- hint は多く出ても異常ではないが、error は修正優先度が高い
- fatal の存在時は一部の補助出力を省略できる

## Auditability Notes

- 重大度を増減したくなった場合は再評価する
- query_result を hint 以外へ昇格させる提案が出た場合は再評価する
- 機械可読スキーマと UI 表示で解釈差が出た場合は再評価する
