# DSL サンプル集

本ファイルは、思考記述 DSL の最小サンプルを個別ファイルで参照するための索引である。

## 一覧

1. [decision-minimal.dsl](decision-minimal.dsl)
問題定義、前提、根拠、判断の最短接続。

2. [partition-mece.dsl](partition-mece.dsl)
MECE 分解と Others の補集合記述。

3. [contradiction-pending.dsl](contradiction-pending.dsl)
矛盾候補、契約違反、pending の混在例。

4. [query-assist.dsl](query-assist.dsl)
補助的 query を含む監査例。

5. [framework-contract.dsl](framework-contract.dsl)
framework 契約の骨格定義。

## 使い方

- まず個別 .dsl ファイルを読む
- 次に [audit-output-sample.json](audit-output-sample.json) を参照して、どの監査結果が返るかを見る
- query を含む例は [query-assist.audit.json](query-assist.audit.json) を参照する
- requirements と照合する場合は [../specs/requirements.md](../specs/requirements.md) を参照する