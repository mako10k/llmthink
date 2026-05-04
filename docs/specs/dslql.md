# DSLQL 設計仕様

## 1. 目的

DSLQL は、llmthink の thought 記述、監査結果、永続化メタデータに対して問い合わせるための query language である。

狙いは jq 互換を再実装することではない。狙いは jq の次の操作感を、llmthink の思考モデルに合わせて持ち込むことである。

- 小さな path access を pipe でつなげる
- 配列や集合を stream として絞り込む
- 射影、整形、並び替えを 1 行で記述する
- query を検索要求だけでなく、思考の検査にも使えるようにする

DSLQL は JSON 全般を対象にしない。対象は llmthink が持つ意味モデルであり、実行時には JSON 風の値へ正規化して評価する。

---

## 2. 設計原則

### 2.1 jq 風だが jq 互換ではない

- pipe、field access、filter、projection を主軸にする
- jq の全機能を追わない
- 再帰 descent、更新代入、任意コード実行は MVP 対象外とする
- llmthink 固有の relation 関数を第一級で持つ

### 2.2 query は思考検査にも使う

- 関連 decision の探索
- 根拠未接続 decision の抽出
- pending を含む step の列挙
- audit finding の集約
- persisted thought の横断検索結果の整形

### 2.3 query 構文を DSLQL へ置き換える

- top-level の `query` ブロック構造は維持する
- query body の正規構文は DSLQL のみとする
- parser は当面 `expression: string` を維持し、query evaluator 側で DSLQL を解釈する
- 従来の function call 形式は設計上の移行対象であり、互換要件としては持たない

---

## 3. 対象データモデル

DSLQL は評価前に thought runtime を query object へ正規化する。MVP の root は次とする。

| Root | 意味 |
| --- | --- |
| `.` | 現在の thought runtime 全体 |
| `.document` | current draft か final の document AST 相当 |
| `.framework` | framework 宣言 |
| `.domains` | domain 一覧 |
| `.problems` | problem 一覧 |
| `.steps` | step 一覧 |
| `.queries` | query 一覧 |
| `.audit` | latest audit result |
| `.thought` | thought metadata、history summary、storage state |
| `.search` | thought search 実行結果の統一 view |

step statement は正規化時に次の共通 field を持つ。

- `step_id`
- `role`
- `id`
- `text`
- `based_on`
- `span`
- `source_kind`: `draft` | `final` | `audit`

これにより、`premise`、`evidence`、`decision`、`pending` を同じ stream として扱える。

---

## 4. コア構文

### 4.1 形

MVP では query body の 1 行を DSLQL expression として扱う。

```text
query Q1:
  .problems[] | select(.id == "P1") | related_decisions
```

### 4.2 基本演算子

| 構文 | 意味 |
| --- | --- |
| `.` | 現在値 |
| `.field` | field access |
| `.field?` | safe field access。存在しなければ empty |
| `.items[]` | array / stream 展開 |
| `expr | expr` | pipe |
| `select(cond)` | filter |
| `map(expr)` | 各要素へ適用 |
| `sort_by(expr)` | 並び替え |
| `limit(n)` | 上位 n 件 |
| `unique_by(expr)` | key 単位の重複排除 |
| `{key: expr, ...}` | object projection |
| `[expr]` | collect |

### 4.3 条件式

| 構文 | 意味 |
| --- | --- |
| `==`, `!=`, `>`, `>=`, `<`, `<=` | 比較 |
| `and`, `or`, `not` | 論理演算 |
| `in` | 集合所属 |
| `contains(x)` | 部分一致または配列包含 |
| `starts_with(x)` | 文字列 prefix |
| `ends_with(x)` | 文字列 suffix |

### 4.4 リテラル

- string: `"decision"`
- number: `1`, `10`, `0.75`
- boolean: `true`, `false`
- null: `null`
- list: `["decision", "pending"]`

---

## 5. llmthink 固有関数

DSLQL の価値は単なる field access ではなく、思考構造の relation を直接引けることにある。MVP では次を定義する。

| 関数 | 入力 | 出力 |
| --- | --- | --- |
| `related_decisions` | problem または problem id | decision stream |
| `based_on_refs` | decision | referenced statement stream |
| `upstream` | statement | 推移的な参照元 stream |
| `downstream` | statement | 推移的な被参照 stream |
| `audit_findings` | severity 省略可 | finding stream |
| `has_open_pending` | any | boolean |
| `score` | search result | ranking score |
| `kind` | any | 正規化後の kind 名 |

MVP では query 記述も DSLQL に統一する。

- problem 単位の decision 探索は `.problems[] | select(.id == "P1") | related_decisions` と書く
- problem 指定は識別子文字列で明示し、`.problems[] | select(.id == "P1") | related_decisions` の形へ正規化する

---

## 6. 実行モデル

### 6.1 Stream ベース評価

- 各式は 0 件以上の値を返す
- `|` は左辺 stream の各要素を右辺へ流す
- `select(...)` は false の要素を落とす
- object projection は各要素を新しい object へ写像する
- `[expr]` は stream を 1 つの array に束ねる

### 6.2 Empty と null

- field 不在は empty とする
- field が存在して値が未設定なら null とする
- empty は pipe を通ると消える
- `?` 付き access は missing field を error にしない

### 6.3 安全性

- DSLQL は read-only とする
- 外部 I/O、任意コード実行、shell 呼び出しは不許可
- 実行コストが高い再帰探索は MVP で不許可

---

## 7. DSL への埋め込み方針

### 7.1 維持するもの

- `query Q1:` の top-level 宣言
- 1 query 1 expression の形
- thought 文書と同居する query 記述

### 7.2 拡張するもの

現行の仕様書では query 式を function call へ限定しているが、DSLQL 導入後は次へ拡張する。

```ebnf
QueryDecl       = "query" Identifier ":" Newline Indent QueryExprLine Dedent ;
QueryExprLine   = DSLQLExpr Newline ;
```

query body は当面 1 行固定とする。複数行 pipeline は将来拡張とし、MVP では parser と editor support を単純に保つ。

### 7.3 移行方針

- evaluator は DSLQL expression のみを受け付ける前提で設計する
- 旧 query 記述の自動変換が必要なら、互換レイヤーではなく migration ツールとして分離する
- 既存 example の更新は parser/evaluator 導入と同じタイミングで行う

---

## 8. 最小構文スケッチ

```ebnf
DSLQLExpr       = PipeExpr ;
PipeExpr        = UnaryExpr { "|" UnaryExpr } ;
UnaryExpr       = PrimaryExpr | FunctionCall | ObjectLiteral | ArrayCollect ;
PrimaryExpr     = "." PathTail? | Literal ;
PathTail        = { "." Identifier ["?"] | "[]" } ;
FunctionCall    = Identifier "(" [ ArgList ] ")" | Identifier ;
ArgList         = DSLQLExpr { "," DSLQLExpr } ;
ObjectLiteral   = "{" ObjectField { "," ObjectField } "}" ;
ObjectField     = Identifier ":" DSLQLExpr ;
ArrayCollect    = "[" DSLQLExpr "]" ;
Literal         = String | Number | Boolean | "null" ;
```

この EBNF は evaluator 実装の起点であり、最終的な precedence と associativity は別途固定する。

---

## 9. 代表クエリ

### 9.1 特定 problem に関連する decision を列挙する

```text
.problems[] | select(.id == "P1") | related_decisions | {id: .id, text: .text, based_on: .based_on}
```

### 9.2 根拠未接続 decision を探す

```text
.steps[] | select(.role == "decision" and len(.based_on) == 0)
```

### 9.3 open pending を持つ thought を検索結果から絞り込む

```text
.search[] | select(has_open_pending(.)) | sort_by(score(.)) | limit(10)
```

### 9.4 warning 以上の audit finding を集計する

```text
.audit | audit_findings("warning") | [.] | {count: len(.), findings: .}
```

---

## 10. MVP 範囲外

- jq 完全互換
- 更新演算子
- 再帰 descent
- ユーザー定義関数
- 複数行 query body
- join、group_by、reduce などの重い集約
- 外部 storage への直接アクセス

---

## 11. 実装順序

1. DSLQL tokenizer / parser を追加する
2. thought runtime を query object へ正規化する
3. core operator を `field access`、`[]`、`|`、`select`、projection に絞って実装する
4. llmthink 固有関数を `related_decisions`、`based_on_refs`、`audit_findings` から追加する
5. CLI、MCP、VSIX で同じ evaluator を共有する
6. 旧 query 記述が残っている example と文書を DSLQL へ移行する

---

## 12. 設計判断

- DSLQL は `query` ブロックの正規構文として導入する
- jq 風の使用感は採るが、意味モデルは llmthink 固有 object を優先する
- 後方互換より、query 言語としての一貫性を優先する
- MVP は stream filtering と projection に集中し、重い集約や再帰探索は後回しにする