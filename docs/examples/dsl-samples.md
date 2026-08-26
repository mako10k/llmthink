# DSL サンプル集

本ファイルは、思考記述 DSL の最小サンプルを個別ファイルで参照するための索引である。

## 一覧

1. [decision-minimal.think](decision-minimal.think)
   問題定義、前提、根拠、判断の最短接続。

2. [partition-mece.think](partition-mece.think)
   MECE 分解と Others の補集合記述。

3. [contradiction-pending.think](contradiction-pending.think)
   矛盾候補、契約違反、pending の混在例。

4. [query-assist.think](query-assist.think)
   補助的 query を含む監査例。

5. [framework-contract.think](framework-contract.think)
   framework 契約の骨格定義。

6. [confidence-propagation.think](confidence-propagation.think)
   版付きキーワード、有理数区間、自己申告値との比較、未解決の複数親aggregationを使う信頼度伝搬例。

## 使い方

- まず標準拡張子 `.think` の個別ファイルを読む。既存の `.dsl` も同じ言語として利用できる
- 次に [audit-output-sample.json](audit-output-sample.json) を参照して、どの監査結果が返るかを見る
- query を含む例は [query-assist.audit.json](query-assist.audit.json) を参照する
- requirements と照合する場合は [../specs/requirements.md](../specs/requirements.md) を参照する
