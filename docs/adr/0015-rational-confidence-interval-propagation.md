# ADR-0015: 信頼度を有理数区間と認識状態で伝搬する

## Status

accepted

## Date

2026-08-26

## Context

- 要求仕様は各判断への信頼度または確度と、Statement の optional confidence を
  当初から拡張要求としている
- ADR-0001 はエンジンを真理判定または推論代行ではなく、再読可能な思考監査の補助と
  位置付けている
- 明示された根拠経路が長くなるにつれて信頼性が低下していても、利用者がその劣化を
  把握できない場合がある
- 単一の厳密値だけでは評価の不確かさを表せず、未評価値を吸収的な `unknown` とすると
  導入初期の計算結果がほぼ利用不能になる
- `based_on` は現時点では参照関係であり、条件付き確率、親間の独立性、因果関係、
  AND / OR の結合意味論を保証していない
- 2026-08-26 に decision owner は、有理数の代表値と幅を内部計算し、`unknown` を
  数値と直交するタグとして扱う設計、および幅を持つ既定値を採用すると確認した

## Decision

### Confidence assessment

信頼度評価は、次の概念モデルを持つ。

```text
ConfidenceAssessment {
  lower: Rational
  estimate: Rational
  upper: Rational
  epistemic_tag: known | estimated | unknown
  origin: explicit | keyword | default | derived
  profile_id: Identifier
  keyword_id?: Identifier
}
```

`Rational` は既約な有理数として正規化し、次の不変条件を満たす。

```text
0/1 <= lower <= estimate <= upper <= 1/1
```

- `estimate` は伝搬に使う作業上の代表値であり、真理確率とは主張しない
- `lower` と `upper` は代表値の不確かさを保持する数値的なメタ情報である
- `epistemic_tag` は数値と直交する認識状態であり、数値との乗算には使わない
- `origin` と `profile_id` により、明示評価、キーワード展開、既定値、派生値を
  区別可能にする
- `origin` が `keyword` の場合は、展開元を再現できるよう `keyword_id` を必須とする
- `known` はすべての関連評価が明示的に確定している場合、`estimated` は明示的な
  幅付き評価を含む場合、`unknown` は既定評価または未評価要素を含む場合に使う
- `unknown` が伝搬しても数値区間は保持し、吸収的な欠損値にはしない

### Assessed and derived nodes

- 入力端の命題ノードには信頼度評価を明示できる
- support graph の中間ノードと結論ノードの信頼度は自動計算する
- decision作者による自己申告値は`declared_confidence`として保持し、`derived_confidence`を
  上書きしない
- `declared_confidence`はincoming scoring edgeを持つderived decisionだけを対象とし、
  intentionalな申告であるため`default`を許さない
- 自己申告estimateをderived intervalと比較し、下側、区間内、上側の関係を保持する。区間外だけを
  semantic hint warningとし、区間内はissueにしない
- 問題、観点、分類などの文脈ノードは、それ自体が命題として明示評価されない限り
  confidence propagation の入力にしない

### Scoring support edges

- confidence propagation は、明示的に scoring support と分類された edge だけを使う
- 現行 `based_on` の存在だけでは、条件付き確率または scoring support を意味しない
- scoring edge の評価は、参照元から参照先への推論、要約、変換が信頼性を保持する
  割合として扱い、条件付き確率とは呼ばない
- scoring support graph は計算対象範囲で非循環でなければならない。cycle、未解決参照、
  不正な区間を含む範囲は `unknown` ではなく `uncomputable` として報告する

scoring path の伝搬は成分ごとの積とする。

```text
path.estimate = source.estimate * product(edge.estimate)
path.lower    = source.lower    * product(edge.lower)
path.upper    = source.upper    * product(edge.upper)
```

複数の incoming scoring parent がある派生ノードは、各 path の意味が必須、代替、補強の
どれであるか、また独立性、相関、交差量が不明である。当面は厳密な合成値を主張せず、
保守的 baseline を成分ごとの最小値で表す。

```text
node.estimate = min(path.estimate)
node.lower    = min(path.lower)
node.upper    = min(path.upper)
```

- baseline に複数経路の存在による上昇を加えない
- result 全体は計算済みのまま保持し、上昇値だけを未算出とする
- `aggregation.status` は `unresolved_dependency`、`baseline_method` は
  `coordinate_min`、`boost_applied` は `false`、`boosted_estimate` は `null` とする
- `unresolved_nodes` に複数の incoming scoring parent を持つ node ID と parent 数を保持し、
  その baseline を使う下流 result にも伝搬する
- `required | alternative | corroborating` の分類、直交度、交差量、独立性による合成は、
  実例が集まるまで導入しない

認識状態は数値と別に伝搬する。関連する入力または edge に `unknown` があれば派生結果も
`unknown`、それ以外で `estimated` があれば `estimated`、すべて `known` の場合だけ
`known` とする。派生結果は、最弱経路に加えて `unknown` または `estimated` の原因 ID を
列挙できなければならない。

### Public DSL and result contract

2026-08-26 の実装開始指示により、保存先は本体 DSL とし、次の source / edge form を
採用する。

```llmthink
confidence EV1:
  estimate 9/10
  range 9/10..9/10
  epistemic known

confidence EV1 -> D1:
  default

confidence EV2:
  keyword strong_assumption

declared_confidence D1:
  keyword rough_assumption
```

- source form は入力端の命題評価を表し、edge form は scoring support を明示分類する
- declared formはderived decisionの自己申告評価を表し、source formやderived assessmentとは
  別に保持する
- explicit form は `estimate`、`range`、`epistemic` を各 1 回必須とする
- keyword form は `keyword IDENTIFIER` の 1 field だけを持ち、versioned profile から区間と
  tag を展開する。default form は profile の既定値だけを選ぶ
- confidence 宣言は新しい宣言 ID を所有せず、source / target は既存 problem または
  statement ID を参照する
- source form と incoming scoring edge が同じ node にある場合、自己申告値で派生値を
  上書きせず `uncomputable` とする
- audit report の `confidence_results` は computed result に assessment、weakest path、
  cause IDs、任意のaggregation metadata、declared assessmentと比較結果、uncomputable resultに
  reasonsを保持する
- DSLQL と preview は audit と同じ正確な有理数字列、区間、tag、origin、profile を表示する

### Default profile

初期 profile `support-trace-v1` を次のように固定する。

```text
default source:
  estimate 1/2
  range    1/4..3/4
  epistemic_tag unknown
  origin   default

default scoring edge:
  estimate 19/20
  range    9/10..1/1
  epistemic_tag unknown
  origin   default
```

default edge の代表値は経路ごとに小さく減衰する一方、上限は `1/1` とし、未評価 edge が
必ず劣化を生むとは断定しない。明示されたモデル内の定義または公理は、対象 scope を
明示した場合に限り `1/1 [1/1..1/1]` を取れる。

profile の値またはタグ導出規則を変更する場合は新しい `profile_id` を発行し、既存結果の
計算条件を暗黙変更しない。

### Keyword profile

`support-trace-v1` は source と scoring edge の意味を混同しないよう、別々の語彙を持つ。
各キーワードは DSL 読み込み時に固定区間へ展開し、`origin keyword`、
`profile_id support-trace-v1`、選択した `keyword_id` を保持する。

| Source keyword           | lower | estimate | upper | tag       |
| ------------------------ | ----- | -------- | ----- | --------- |
| `defined`                | 1/1   | 1/1      | 1/1   | known     |
| `common_fact`            | 49/50 | 99/100   | 1/1   | estimated |
| `strong_assumption`      | 17/20 | 9/10     | 19/20 | estimated |
| `rough_assumption`       | 7/10  | 4/5      | 9/10  | estimated |
| `unsupported_assumption` | 1/4   | 1/2      | 3/4   | unknown   |
| `unlikely_assumption`    | 1/10  | 1/4      | 1/2   | estimated |
| `likely_refuted`         | 1/20  | 1/8      | 1/4   | estimated |
| `refuted`                | 0/1   | 1/100    | 1/50  | estimated |

| Edge keyword            | lower | estimate | upper | tag       |
| ----------------------- | ----- | -------- | ----- | --------- |
| `exact_transform`       | 1/1   | 1/1      | 1/1   | known     |
| `reliable_inference`    | 49/50 | 99/100   | 1/1   | estimated |
| `strong_inference`      | 17/20 | 9/10     | 19/20 | estimated |
| `approximate_inference` | 7/10  | 4/5      | 9/10  | estimated |
| `unsupported_inference` | 1/4   | 1/2      | 3/4   | unknown   |
| `weak_inference`        | 1/10  | 1/4      | 1/2   | estimated |
| `likely_invalid`        | 1/20  | 1/8      | 1/4   | estimated |
| `invalid`               | 0/1   | 1/100    | 1/50  | estimated |

`defined` は対象 domain 内で完全に定義された事実・定義・採用済み前提、`exact_transform` は
意味を失わない変換に限る。一般的な事実や強い推論へ便宜的に `1/1` を与えない。
キーワードは記述量を減らす calibration preset であり、真偽ラベルではない。

### Authority boundary

confidence propagation は監査補助の派生ビューであり、次には使わない。

- 命題または結論の真偽確定
- decision の自動生成
- thought の finalize、承認、公開、保存を自動許可または拒否する authority
- ADR-0002 の audit severity の置き換え
- 未定義の独立性、相関、因果関係、条件付き確率の推定
- default 値を明示評価済みの事実として表示すること

## Alternatives Considered

- 複数親result全体を`uncomputable`にする
  - 各pathと保守的baselineは計算可能であり、依存関係不明なのは上昇分だけなので不採用
- 複数経路を独立とみなして信頼度を自動上昇させる
  - 現行値は真理確率ではなく、直交度、交差量、相関も未定義なので不採用
- `confidence D1:`を文脈依存でsource評価または自己申告値に読み替える
  - 同じ構文の意味がincoming edgeの有無で変わるため不採用。`declared_confidence`を明示する
- 自己申告値でderived assessmentを上書きする
  - 推論経路の劣化が隠れ、比較監査ができなくなるため不採用
- 未評価値を吸収的な `unknown` として伝搬する
  - 未評価要素が一つでもあると数値が消え、導入初期に機能が使われなくなるため不採用
- 信頼度を単一の有理数だけで持つ
  - 丸めは避けられるが、厳密値であるかのような偽の精密さを生むため不採用
- 主信頼度と数値メタ信頼度を掛けて単一値へ縮約する
  - 命題の弱さと評価値の不確かさが同じ軸に混ざるため不採用
- 各 edge を条件付き確率として Bayesian network を構築する
  - 複数親の同時条件、独立性、相関、事前分布が現行 DSL に存在せず、ADR-0001 の
    監査責務を越えるため不採用
- 浮動小数点の平均と分散を使う
  - 丸め、直列化差異、分布仮定を初期契約へ持ち込むため不採用
- 有理数の代表値と区間を直交タグ付きで伝搬する
  - 数値計算を継続しながら不確かさと provenance を保持できるため採用

## Consequences

- 長い support path の代表値低下と、その幅を同時に可視化できる
- `unknown` が頻出しても計算値は失われず、原因 ID を評価作業へ戻せる
- 複数経路による信頼度上昇は自動計算しないため、独立した裏付けの加点は将来の別設計になる
- 複数親の baseline は厳密な合成結果ではないことと、上昇値が未算出であることを機械可読に
  判別できる
- decision作者の自己申告値とDAG派生値の乖離を、どちらかを失わず再読できる
- `estimate` は経路長の影響を受けるため、実文書で過度な深さペナルティがないか profile を
  継続評価する必要がある
- 分子と分母が経路長に応じて成長するため、実装は gcd 正規化と入力サイズ上限を必要とする
- audit report、DSLQL、preview、CLI、MCP で同じ区間、タグ、profile、原因 ID を共有する
  共通モデルが必要になる

## Implementation Notes

- 本 ADR の初版では DSL 構文、保存形式、API schema、UI 表記を後続設計に残したが、
  decision owner の 2026-08-26 の実装開始指示により上記 public contract を固定した
- 実装では分子と分母を任意精度整数で保持し、分母を正、最大公約数で既約化する
- 入力および派生有理数は分子・分母を各 256 桁までとし、超過した計算 scope は監査全体を
  中断せず `uncomputable` とする
- 小数値は表示専用の近似値とし、保存、比較、伝搬の正本にしない
- profile 適用前の明示値と、適用後の派生値を区別して取得できるようにする

## Review

- ADR-0001 を supersede しない。confidence は真理判定ではなく補助的な監査ビューに留める
- ADR-0002 を supersede しない。confidence と audit severity は独立した軸に保つ
- decision owner は 2026-08-26 に本 ADR の数値区間、直交タグ、幅付き default を確認した
- decision owner は 2026-08-26 に、複数親は保守的 baseline を維持し、厳密な合成と
  信頼度上昇を後続検討に残す方針を確認した
- decision ownerは2026-08-26に次の実装残件へ進むよう指示し、自己申告値と派生値を分離する
  follow-upの実装を開始した

## Traceability

- Claim `C-CONF-001`: 未評価要素があっても信頼度劣化を数値として追跡できる必要がある
  - Evidence `E-CONF-001`: strict unknown propagation は未評価要素を含む結果を数値化できない
  - Evidence `E-CONF-002`: decision owner は数値と `unknown` タグの直交を確認した
- Claim `C-CONF-002`: 数値的な不確かさを真理確率と混同せず保持する必要がある
  - Evidence `E-CONF-003`: ADR-0001 は真理判定と推論代行を非採用としている
  - Evidence `E-CONF-004`: 現行 `based_on` は条件付き確率や独立性を表現しない
- Claim `C-CONF-003`: 実装には保存先、scoring edge 分類、出力 schema の明示契約が必要である
  - Evidence `E-CONF-005`: decision owner は 2026-08-26 に固定済み設計の実装開始を指示した
- Claim `C-CONF-004`: 頻用する評価は数値の意味と出所を失わず短く宣言できる必要がある
  - Evidence `E-CONF-006`: decision owner は初期設計で代表的な信頼度キーワードを提示した
  - Evidence `E-CONF-007`: decision owner は 2026-08-26 に未実装のキーワードプロファイルを指摘した
- Claim `C-CONF-005`: 複数親の依存関係が不明でもbaselineを失わず、厳密合成済みとの誤認を
  防ぐ必要がある
  - Evidence `E-CONF-008`: 現行DSLはsupport pathの必須、代替、補強を分類しない
  - Evidence `E-CONF-009`: decision owner は直交度、交差量、対象ケースが未把握であるため、
    詳細な合成規則を後続検討とする方針を確認した
- Claim `C-CONF-006`: decision作者の自己申告値はDAG派生値を上書きせず、差異を監査できる
  必要がある
  - Evidence `E-CONF-010`: 自己申告値による上書きは信頼度劣化を再び不可視化する
  - Evidence `E-CONF-011`: decision ownerは2026-08-26に次のconfidence follow-upへ進むよう
    指示した
- Action `A-CONF-001`: requirements の confidence 要求を本 ADR の概念モデルへ接続する
  - Status: completed by this decision change
- Action `A-CONF-002` (`C-CONF-003`): DSL 構文、保存形式、API schema を決定し実装する
  - Status: completed by the public contract and implementation in parser, analyzer, audit schema,
    DSLQL, report, LSP, and preview
- Action `A-CONF-003`: representative corpus で `support-trace-v1` の深さ感度を検証する
  - Status: pending representative calibration; the regression sample is not calibration evidence
- Action `A-CONF-004`: 有理数肥大化を局所的な `uncomputable` として境界化する
  - Status: completed by the 256-digit arithmetic guard and regression test
- Action `A-CONF-005` (`C-CONF-004`): source / edge の版付きキーワード表、DSL 展開、provenance を実装する
  - Status: completed by `support-trace-v1` keyword tables, parser, formatter, schema, DSLQL,
    report, LSP, preview, and regression tests
- Action `A-CONF-006` (`C-CONF-005`): 複数親の保守的baselineと未解決aggregationを分離して
  出力し、下流へ伝搬する
  - Status: completed by confidence result aggregation metadata, schema validation, DSLQL,
    report, preview, and regression tests
- Action `A-CONF-007` (`C-CONF-006`): declared confidenceをderived assessmentと分離し、
  interval外の差異を監査する
  - Status: completed by explicit DSL syntax, parser, comparison evaluator, audit warning,
    schema, DSLQL, report, LSP, preview, and regression tests

## Follow-ups

- 相関、反証 edge、代替 support、独立した裏付けの加点が必要になった場合の別 ADR
- representative corpus から `required | alternative | corroborating` の必要ケースと頻度を
  抽出し、複数親aggregationを再設計する
- 実データで default source、default edge、tag 閾値を再評価する calibration 手順

## Auditability Notes

- confidence が finalize、severity、承認、公開の authority に使われ始めた場合は再評価する
- `estimate` が真理確率として表示または解釈され始めた場合は再評価する
- 最弱経路方式が独立した裏付けを過小評価すると実証された場合は aggregation を再評価する
- `coordinate_min` baseline が厳密な合成値として表示または解釈され始めた場合は再評価する
- default profile による経路長ペナルティが思考の丁寧な分解を阻害した場合は、新しい profile ID で
  再調整する
- 区間だけでは相関または分布形状を表現できないユースケースが現れた場合は、平均、二次モーメント、
  covariance を別 ADR で検討する
