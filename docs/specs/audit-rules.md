# 監査ルール仕様

## 1. 目的

本書は、思考監査エンジンが MVP で適用する監査ルールを固定する。

本仕様は truth 判定ではなく、思考記述の内部整合性と規律を評価するためのルールセットである。

---

## 2. 出力の基本単位

各監査結果は、次を持つ。

- category
- severity
- target_refs
- message
- rationale optional
- suggestion optional

カテゴリと重大度は [../../schemas/audit-result.schema.json](../../schemas/audit-result.schema.json) に従う。

---

## 3. MVP 監査カテゴリ

### 3.1 contradiction

- 同一観点で両立不能な判断が、明確な根拠付きで共存する場合
- MVP では原則未使用でもよい

推奨重大度:

- error

### 3.2 contradiction_candidate

- 同一問題に対して緊張関係にある判断が存在する場合
- 観点や根拠が不足しており、明確な contradiction までは断定できない場合

推奨重大度:

- warning

### 3.3 contract_violation

- framework 契約に反する場合
- 未解決参照がある場合
- 必須要素が欠落している場合

推奨重大度:

- error または fatal

### 3.4 mece_assessment

- partition が Domain や axis と整合していない場合
- Others の扱いが補集合として不正確な場合
- 被覆性や排他性に疑義がある場合

推奨重大度:

- warning

### 3.5 semantic_hint

- 再読支援のための補足を返す場合
- 意味論的距離や関連候補を参考情報として返す場合

推奨重大度:

- info または hint

### 3.6 query_result

- query が与えられた場合の補助結果

推奨重大度:

- hint

---

## 4. ルール一覧

### R001 decision_without_reference

対象:

- decision

条件:

- based_on が空である

結果:

- category = contract_violation
- severity = error

### R002 unresolved_reference

対象:

- decision based_on
- query 引数

条件:

- 参照先 Identifier が解決できない
- decision based_on の参照先は declared problem id または statement id とする

結果:

- category = contract_violation
- severity = fatal

### R003 missing_framework_requirement

対象:

- 文書全体

条件:

- framework が requires した要素が存在しない

結果:

- category = contract_violation
- severity = error

### R004 contradictory_decision_candidate

対象:

- 複数 decision

条件:

- 少なくとも一部の based_on 参照を共有する
- ただし contradiction と断定できるだけの明示条件が不足している

結果:

- category = contradiction_candidate
- severity = hint

注記:

- 現行 MVP では same problem と結論の逆向き判定までは行わず、shared based_on を持つ decision 組だけを弱いヒントとして返す

### R005 pending_reduces_confidence

対象:

- pending
- decision

条件:

- 未解決の pending が残っている
- かつ強い decision が存在する

結果:

- category = semantic_hint
- severity = info

### R006 partition_missing_axis

対象:

- partition

条件:

- axis が解決不能または欠落

結果:

- category = mece_assessment
- severity = warning

### R007 others_without_domain_context

対象:

- partition member Others

条件:

- Domain または partition context が不十分で補集合の解釈が不安定

結果:

- category = mece_assessment
- severity = warning

### R008 query_returns_hint

対象:

- query

条件:

- query が存在する

結果:

- category = query_result
- severity = hint

### R009 orphan_problem

対象:

- problem

条件:

- どの decision からも direct な based_on 参照を受けていない
- orphan_future または orphan_reference annotation がない

結果:

- category = semantic_hint
- severity = warning

注記:

- first pass では transitive graph や意味推定ではなく explicit based_on edge のみを見る

### R010 orphan_supporting_node

対象:

- premise
- evidence

条件:

- どの decision からも direct な based_on 参照を受けていない
- orphan_future または orphan_reference annotation がない

結果:

- category = semantic_hint
- severity = hint

注記:

- suppression は orphan finding にだけ効き、unresolved reference や decision_without_reference には効かない

---

## 5. 判定順序

1. 構文エラー確認
2. 参照解決
3. framework 契約検査
4. decision 系監査
5. partition と MECE 系監査
6. pending と再読補助
7. query 補助結果

fatal が発生した場合、query_result の生成は省略可能とする。

---

## 6. 実装メモ

- contradiction は MVP で無理に断定しない
- contradiction_candidate を先に実装する
- semantic_hint は truth ではなく補足説明として返す
- mece_assessment は警告中心で始める
