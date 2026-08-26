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
- evaluator が返す順序付き `DslqlValue[]` を `values` に保持する
- decision 候補への暗黙変換、固定 score、query expression embedding、暗黙再順位付けを行わない
- raw report は `total_value_count == values.length`、`truncated == false` とする
- presentation で省略する場合だけ、原本を変更せず `total_value_count` と `truncated == true` を返す

推奨重大度:

- hint

### 3.7 confidence_results

- 明示された confidence source / scoring edge から `support-trace-v1` の派生ビューを返す
- `keyword` 宣言は source / edge 別の版付き表から区間へ展開し、展開元 `keyword_id` を保持する
- 計算済み result は audit issue に変換せず、`confidence_results` に区間、epistemic tag、profile、最弱経路、原因 ID を保持する
- 複数の incoming scoring parent は成分ごとの最小値を保守的baselineとして返すが、厳密な
  合成または上昇とは扱わない。`aggregation` に `unresolved_dependency`、
  `coordinate_min`、`boost_applied: false`、`boosted_estimate: null`、原因nodeとparent数を保持し、
  そのbaselineを使う下流resultにも伝搬する
- `declared_confidence`はderived assessmentと別に保持する。自己申告estimateがderived interval外なら
  `semantic_hint` warningを返し、区間内ならcomparisonだけを保持してissueにしない
- cycle、未解決参照、scope 不一致、算術上限は `uncomputable` とし、`semantic_hint` warning も返す
- `unknown` は数値欠損または計算不能を意味せず、区間と直交する認識タグとして扱う
- confidence は真偽、audit severity、finalize、承認、公開の authority にしない

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
- query_results[].values = evaluator の順序付き出力
- query_results[].total_value_count = 評価された総値数
- query_results[].truncated = raw report では false

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

### Evidence resource structural validation

対象:

- evidence 配下の resource

条件:

- locator が url / file / blob のいずれかちょうど 1 つでない
- field が未知または重複している
- URL scheme、sha256 digest、MIME type、label、blob と digest の組合せが構造契約を満たさない

結果:

- parse error / fatal

注記:

- 通常 audit は URL fetch、file read、digest verification、MIME sniff を実行しない
- resource の存在とは有効な locator が記述されていることであり、外部 resource の到達可能性ではない
- resource は匿名 value で、宣言参照や orphan supporting node の独立対象にはしない

### R011 comparison_unresolved_reference

対象:

- comparison

条件:

- problem、viewpoint、または左右の decision 参照が解決できない

結果:

- category = contract_violation
- severity = fatal

### R012 comparison_scope_conflict

### R013 block_text_single_line

対象:

- domain description
- problem text
- premise / evidence / decision / comparison / pending text
- annotation text

条件:

- block text を使っている
- ただし実際の本文は 1 行のみである

結果:

- category = semantic_hint
- severity = hint

注記:

- block text は複数行本文や quote 回避が必要な場合へ寄せ、短文は quoted line を基本形とする

### R014 long_quoted_text

対象:

- domain description
- problem text
- premise / evidence / decision / comparison / pending text
- annotation text

条件:

- quoted line を使っている
- 本文が 1 行で、85 文字以上ある

結果:

- category = semantic_hint
- severity = hint

注記:

- 長い本文は block text へ寄せ、意味の切れ目で明示的に改行する

### R015 multiline_status_annotation

対象:

- annotation status

条件:

- status annotation の本文が複数行である

結果:

- category = contract_violation
- severity = error

注記:

- status は機械解釈する列挙値なので単一行 scalar として書く

対象:

- comparison

条件:

- 同一 problem / viewpoint scope 内で incomparable と preference が同じ decision 組に併存する
- または preference relation に cycle がある

結果:

- category = contradiction_candidate
- severity = warning

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

## 6. LSP 診断表示

- LSP の既定表示は raw audit の category と severity を維持する
- `minimumSeverity` は effective severity より弱い診断を除外する
- `suppressedCategories` は指定カテゴリを除外する
- category severity override は補助カテゴリ `semantic_hint` と `contradiction_candidate` に限定し、`error | warning | info | hint | off` を指定できる
- override を適用してから `minimumSeverity` を判定する
- `off` と category suppression は Problems 表示だけに作用し、raw audit report を変更しない
- 設定変更時は open document を再診断する
- 同じ `based_on` を共有するだけの decision 組は `contradiction_candidate/hint` とし、明示 comparison の preference cycle または incomparable との競合は `contradiction_candidate/warning` のまま区別する。LSP はこれを自動昇格しない

## 7. 実装メモ

- contradiction は MVP で無理に断定しない
- contradiction_candidate を先に実装する
- semantic_hint は truth ではなく補足説明として返す
- mece_assessment は警告中心で始める
