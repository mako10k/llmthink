# DSLQL v2 設計仕様

## 1. 位置付け

DSLQL は、llmthink の document AST、監査結果、thought metadata、検索結果を読み取り専用で問い合わせる Query Language である。jq の構文を再現することではなく、次の二点を同時に満たすことを目的とする。

- DSL 文書に埋め込める、小さく宣言的な query 構文
- parser が返す Query AST を visitor、transformer、formatter、evaluator から直接操作できる公開 API

v2 は旧 DSLQL との構文互換を持たない。曖昧な暗黙挙動より、一貫した AST と評価規則を優先する。

## 2. 再構成レビュー

旧実装には、仕様・構文・評価器の間に次の非対称があった。

| 観点       | 旧実装の問題                                                                   | v2 の判断                                                  |
| ---------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| 構文と実装 | `in`、文字列 predicate、list literal、複数の relation 関数が仕様だけに存在した | 本仕様に列挙する構文と組み込み関数を実装・テスト対象にする |
| AST        | 大半の node 型が非公開で source range がなかった                               | 全 node を discriminated union と range 付きで公開する     |
| 呼出し     | bare identifier と `name()` が同じ call AST になった                           | 関数は常に `name(...)` と書く                              |
| 参照       | `.id == "P1"` という通常の文字列比較を静的参照と推測した                       | 宣言参照を `@P1` として第一級 AST node にする              |
| path       | required access と safe access が同じく empty を返した                         | required は失敗、`?` 付きだけが empty を返す               |
| 射影       | object field の複数結果を先頭一件へ黙って縮退した                              | 0 件は field 省略、1 件は採用、複数件は評価エラーにする    |
| 比較       | 順序比較が `Number(...)` で暗黙変換された                                      | number 同士または string 同士だけを比較する                |
| relation   | `related_decisions` が入力 problem を無視した                                  | 入力 node から relation index を辿る                       |
| runtime    | `.document` と root 直下に同じ collection が重複した                           | root context と document AST を一意の階層にする            |
| API        | evaluator が毎回文字列を parse し、AST を評価できなかった                      | parse 済み AST と文字列の両方を評価できる                  |
| 宣言 ID    | Analyzer、runtime、semantic、LSP が別々の ID 集合を作っていた                  | 文書内の全宣言を一つの index と namespace で扱う           |
| query 出力 | 任意の DSLQL 値を decision 候補へ暗黙縮退し、補助 score で再順位付けした       | 評価結果を順序付き `values` としてそのまま保持する         |
| 関数仕様   | arity、説明、補完、highlight の関数一覧が各層に重複していた                    | `DSLQL_FUNCTION_SPECS` を公開メタデータの正とする          |

## 3. 設計原則

1. すべての式は 0 件以上の値からなる stream を受け、stream を返す。
2. 同じ AST は、DSL 文書への埋め込み、静的解析、変換、実行で共有する。
3. 値の欠落、複数値、型不一致を黙って補正しない。
4. 宣言 ID の参照と通常の文字列を構文上区別する。
5. document runtime は source AST の全構造を失わず、一つの正規形だけを持つ。
6. evaluator から外部 I/O、更新代入、任意コード実行を行わない。embedding I/O は host の runtime preparation に限定する。
7. framework、domain、problem、step、statement、query の ID は文書全体で一意とする。

## 4. 公開 AST 契約

### 4.1 Node

すべての AST node は `kind` と `range` を持つ。`range.start` は inclusive、`range.end` は exclusive で、offset は 0-based、line と column は 1-based である。

主な expression kind は次のとおり。

- `literal`
- `reference`
- `path`
- `array`
- `object`
- `call`
- `unary`
- `binary`
- `pipe`

path segment は `property`、`index`、`iterate`、object field は `field` として同じ visitor から観察できる。

### 4.2 API

```ts
parseDslqlExpression(source): DslqlExpression
validateDslqlAst(ast): void
formatDslqlExpression(ast): string
visitDslqlAst(ast, visitor): void
transformDslqlAst(ast, transformer): DslqlExpression
collectDslqlReferences(sourceOrAst): DslqlReference[]
collectDslqlReferenceIds(sourceOrAst): string[]
evaluateDslqlExpression(sourceOrAst, runtime): DslqlValue[]
createDocumentDslqlRuntime(documentAst, options): DslqlRuntime
documentAstToDslqlValue(documentAst): DslqlValue
usesSemanticDslql(sourceOrAst): boolean
createSemanticDslqlRuntime(runtime, sourceOrAst, options): Promise<DslqlRuntime>
createSemanticDocumentDslqlRuntime(documentAst, sourceOrAst, options): Promise<DslqlRuntime>
evaluateSemanticDslqlExpression(sourceOrAst, runtime, options): Promise<DslqlValue[]>
evaluateSemanticDocumentDslqlExpression(sourceOrAst, documentAst, options): Promise<DslqlValue[]>
DEFAULT_DSLQL_ON_DEMAND_EMBEDDING_LIMIT: 8
DSLQL_FUNCTION_SPECS: readonly DSLQLFunctionSpec[]
getDslqlFunctionSpec(name): DSLQLFunctionSpec | undefined
listDslqlFunctionSpecs(categories?): DSLQLFunctionSpec[]
createDocumentDeclarationIndex(documentAst): DocumentDeclarationIndex
```

transform は expression、path segment、object field を含む全 node に対して bottom-up である。callback が `undefined` を返した場合は、変換済み children を持つ node が維持される。

`validateDslqlAst` は public AST の fail-closed boundary である。全 node category、operator、identifier、unique object field、finite number、非負 safe integer index、包含関係を満たす source range、cycle 不在を検査する。parser の出力、formatter、visitor、transformer の入力と出力、reference collector、evaluator、semantic runtime preparation は同じ validator を通る。手組みまたは transformer が返した不正 AST は `DslqlAstValidationError` とし、NaN を `null` に整形したり、大きな index を丸めたりしない。

`SemanticDslqlRuntimeOptions.maxOnDemandEmbeddings` は distinct string literal の遅延生成上限で、既定値は `DEFAULT_DSLQL_ON_DEMAND_EMBEDDING_LIMIT` の 8 である。Analyzer の `AuditOptions` では同じ値を `semanticMaxOnDemandEmbeddings` として受け取り、semantic runtime option へ渡す。

## 5. 構文

### 5.1 EBNF

```ebnf
Expression       = PipeExpr ;
PipeExpr         = OrExpr { "|" OrExpr } ;
OrExpr           = AndExpr { "or" AndExpr } ;
AndExpr          = ComparisonExpr { "and" ComparisonExpr } ;
ComparisonExpr   = UnaryExpr [ ComparisonOp UnaryExpr ] ;
ComparisonOp     = "==" | "!=" | ">" | ">=" | "<" | "<=" | "in" ;
UnaryExpr        = "not" UnaryExpr | PrimaryExpr ;
PrimaryExpr      = PathExpr | Reference | Literal | ArrayExpr
                 | ObjectExpr | CallExpr | "(" Expression ")" ;
PathExpr         = CurrentPath | RootPath ;
CurrentPath      = "." [ Identifier ["?"] ] { PathSegment } ;
RootPath         = "$" { PathSegment } ;
PathSegment      = Property | Bracket ;
Property         = "." Identifier ["?"] ;
Bracket          = "[]" ["?"]
                 | "[" UnsignedInteger "]" ["?"]
                 | "[" String "]" ["?"] ;
Reference        = "@" Identifier ;
ArrayExpr        = "[" [ Expression { "," Expression } ] "]" ;
ObjectExpr       = "{" [ ObjectField { "," ObjectField } ] "}" ;
ObjectField      = (Identifier | String) ":" Expression ;
CallExpr         = Identifier "(" [ Expression { "," Expression } ] ")" ;
Literal          = String | Number | "true" | "false" | "null" ;
```

比較の chain は許可しない。`.a < .b < .c` は `.a < .b and .b < .c` と明示する。

### 5.2 Path

| 構文          | 意味                              |
| ------------- | --------------------------------- |
| `.`           | 現在の input stream               |
| `$`           | runtime root                      |
| `.field`      | required property access          |
| `.field?`     | optional property access          |
| `.["non-id"]` | string key access                 |
| `.items[0]`   | array index                       |
| `.items[]`    | array 展開                        |
| `.items[]?`   | input が array でない場合も empty |

required access で property 不在、型不一致、index 範囲外が起きた場合は `DslqlEvaluationError` とする。optional access は該当 input から値を出さない。

### 5.3 宣言参照

`@P1` は文字列値 `"P1"` として評価されるが、AST 上は `reference` node である。これにより、静的な未解決参照検査、rename、definition lookup を通常の文字列検索から分離できる。

文書宣言の namespace は framework、domain、problem、step、statement、query をすべて含む。異なる kind であっても同じ ID は parse 時の `ParseError` になる。Analyzer の DSLQL reference、relation runtime、semantic `@ID`、LSP definition / rename は `DocumentDeclarationIndex` の同じ集合を使う。なお、DSL の `decision based_on` が参照できるのは従来どおり problem と statement に限り、DSLQL の全宣言 namespace とは別の role 制約である。

```text
.document.problems[] | select(.id == @P1)
```

`.id == "P1"` も実行時の比較としては有効だが、宣言参照とは見なさない。

### 5.4 Array と object

`[expr, ...]` は各 expression を現在の input stream 全体に対して評価し、全結果を一つの array へ集約する。

```text
.document.steps[].statement | select(.role == "decision") | [.id]
```

object は input ごとに一つ生成する。各 field expression の結果は次の cardinality 契約を持つ。

- 0 件: field を省略する
- 1 件: その値を field value にする
- 2 件以上: lossless に扱えないため評価エラー

複数値を field に入れる場合は `{ids: [.id]}` のように array を明示する。

## 6. 評価意味論

### 6.1 Stream と pipe

runtime root を一件だけ持つ stream から評価を開始する。pipe は左から右へ、直前の出力 stream 全体を次の式へ渡す。

通常の path、literal、unary、binary、object は input ごとに評価される。array、`sort_by`、`unique_by`、`limit` は stream 全体を束ねる操作である。

### 6.2 Empty と null

- empty は値ではなく、stream の要素数 0 を表す。
- null は一件の値である。
- optional path の欠落は empty になる。
- comparison の片辺が empty なら結果は false になる。
- object field が empty なら field 自体を省略する。

### 6.3 真偽値

empty、`false`、`null` を false とし、それ以外を true とする。条件式と論理 operand は 0 または 1 値を要求し、複数値は評価エラーにする。`and` と `or` は short-circuit、`not` はこの規則を反転する。

### 6.4 比較

- `==` と `!=` は object key 順を正規化した deep equality を使う。
- `<`、`<=`、`>`、`>=` は number 同士または string 同士に限る。
- `in` の右辺は array でなければならない。
- comparison operand が複数値を返す場合は評価エラーとする。

## 7. 組み込み関数

すべての関数は括弧を必須とする。関数名、category、arity、operand label、result、semantic flag、summary の正は `DSLQL_FUNCTION_SPECS` であり、evaluator、Help/MCP、LSP、VSIX の公開面はこの registry との被覆を検査する。

| 関数                    | stream 契約                                                     |
| ----------------------- | --------------------------------------------------------------- |
| `select(predicate)`     | predicate が truthy の input だけを返す                         |
| `map(expression)`       | input ごとに expression を評価して flat-map する                |
| `sort_by(selector)`     | string または number の同一型 key で stable ascending sort する |
| `unique_by([selector])` | 値または selector key の deep equality で先勝ち重複排除する     |
| `limit(n)`              | 非負 safe integer の先頭 n 件を返す                             |
| `len()`                 | 各 input の string、array、object の長さを返す。null は 0       |
| `len(expression)`       | 各 input で expression が返す単一値の長さを返す                 |
| `contains(value)`       | string 部分一致または array 要素の deep inclusion               |
| `starts_with(text)`     | string prefix 判定                                              |
| `ends_with(text)`       | string suffix 判定                                              |
| `kind()`                | `null`、`boolean`、`number`、`string`、`array`、`object` を返す |

未知の関数、arity 不一致、型不一致は empty ではなく `DslqlEvaluationError` にする。

## 8. document runtime

`createDocumentDslqlRuntime(documentAst, options)` が作る root は次の一形だけを持つ。

```text
{
  document: DocumentNode,
  audit: object | null,
  thought: object | null,
  search: array
}
```

旧版のように `.problems` と `.document.problems` を重複させない。
`audit` は llmthink の `AuditReport` と同じ `results` field を持つ形を受け取る。

runtime の relation index は `DocumentDeclarationIndex` の宣言順と一意性を再利用する。Map の last-wins で重複 ID を黙って上書きしない。

### 8.1 DocumentNode

```text
document
├── framework: framework | null
├── domains: domain[]
├── problems: problem[]
├── steps: step[]
│   └── statement: statement
├── confidence: confidence[]
├── confidence_results: confidence_result[]
└── queries: query[]
```

主要な normalized node は `node_kind`、宣言 node は `id`、source を持つ node は `span` を持つ。`span`、text body、step syntax、partition member のような補助 value object は `node_kind` を持たない。

正規化 schema は次のとおり。`span` は `{line, column}`、text body は `{syntax, span, line_count}` である。

| `node_kind`         | field                                                                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `document`          | `framework`, `domains`, `problems`, `steps`, `confidence`, `confidence_results`, `queries`                                                            |
| `framework`         | `id`, `rules`, `span`                                                                                                                                 |
| `framework_rule`    | `rule_kind`, `value`, `span`                                                                                                                          |
| `domain`            | `id`, `description`, `description_body`, `span`                                                                                                       |
| `problem`           | `id`, `text`, `text_body`, `annotations`, `span`                                                                                                      |
| `step`              | `id`, `statement`, `syntax: {step, step_id}`, `span`                                                                                                  |
| `statement`         | 共通の `role`, `id`, `span` と、下記の role 固有 field                                                                                                |
| `annotation`        | `annotation_kind`, `text`, `body`, `span`                                                                                                             |
| `confidence`        | `confidence_kind`, `source_id`, `target_id`, `assessment`, `syntax`, `span`                                                                           |
| `confidence_result` | `target_id`, `node_kind`, `status`, `assessment`, `declared_assessment`, `declared_comparison`, `weakest_path`, `aggregation`, `cause_ids`, `reasons` |
| `query`             | `id`, `expression`, `span`, `expression_span`                                                                                                         |

confidence assessment は `lower`、`estimate`、`upper` を既約な有理数字列で返し、`epistemic_tag`、`origin`、`profile_id` を併記する。keyword 展開値は `keyword_id` も返す。`unknown` は数値欠損ではない。`uncomputable` result の `assessment` と `weakest_path` は `null` で、`reasons` に cycle、未解決参照、scope 不一致などを保持する。

複数親のconfidence resultとその下流は、`aggregation.status = "unresolved_dependency"`、
`baseline_method = "coordinate_min"`、`boost_applied = false`、`boosted_estimate = null`、
`unresolved_nodes[] = {target_id, parent_count}` を返す。これはresult全体の計算不能ではなく、
複数経路による上昇値だけが未算出であることを表す。該当しないresultの`aggregation`は`null`である。

`declared_confidence`を持つcomputed resultは`declared_assessment`と
`declared_comparison.relation`を返す。relationは`below_derived_interval`、
`within_derived_interval`、`above_derived_interval`のいずれかで、自己申告estimateをderived intervalと
正確な有理数で比較する。derived resultがuncomputableの場合も`declared_assessment`は保持するが、
comparisonは`null`になる。

statement の role 固有 field は次のとおり。

| `role`               | field                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `premise`, `pending` | `text`, `text_body`, `annotations`                                                                                    |
| `evidence`           | `text`, `text_body`, `resources`, `annotations`                                                                       |
| `viewpoint`          | `axis`                                                                                                                |
| `partition`          | `domain_id`, `axis`, `members: {name, predicate}[]`                                                                   |
| `decision`           | `text`, `text_body`, `annotations`, `based_on`                                                                        |
| `comparison`         | `text`, `text_body`, `annotations`, `problem_id`, `viewpoint_id`, `relation`, `left_decision_id`, `right_decision_id` |

- `textBody` → `text_body`
- `descriptionBody` → `description_body`
- `lineCount` → `line_count`
- framework / domain / problem の `name` → `id`
- annotation `kind` → `annotation_kind`
- framework rule `kind` → `rule_kind`
- `basedOn` → `based_on`
- `domainName` → `domain_id`
- `problemId` → `problem_id`
- `viewpointId` → `viewpoint_id`
- `leftDecisionId` → `left_decision_id`
- `rightDecisionId` → `right_decision_id`
- `expressionSpan` → `expression_span`
- step syntax の `stepId` → `step_id`

`evidence.resources[]` は source 順の匿名 object value であり、各要素は `node_kind: "evidence_resource"`、`locator_kind`、`locator`、`digest`、`mime`、`label`、`span` を持つ。省略可能 metadata は `null` に正規化する。resource は宣言ではないため `@ID` では参照できず、その locator や metadata を semantic operand の暗黙本文にも含めない。`mime` は記述者の metadata claim であり、embedding provider / model の選択authorityには使わない。

resourceの自動取得、本文抽出、OCR、caption、transcription、binary fingerprint、media別embedding、content-derived embeddingは、段階的な実装予定ではなく現時点の非目標である。採用する場合はADR-0016の再入場条件に従い、別Issueと別ADRで判断する。

step は `id`、`syntax`、`span`、`statement` を保持する。statement を flat にした別名 collection は作らない。

### 8.2 llmthink runtime 関数

| 関数                           | 入力                     | 出力                                           |
| ------------------------------ | ------------------------ | ---------------------------------------------- |
| `related_decisions()`          | problem node または ID   | 参照 graph 上でその node を上流に持つ decision |
| `based_on_refs()`              | decision またはその step | `based_on` の直接参照 node                     |
| `upstream()`                   | 宣言 node                | 推移的な参照先 node                            |
| `downstream()`                 | 宣言 node                | 推移的な被参照 node                            |
| `audit_findings([severity])`   | audit object             | finding。severity 指定時はその重要度以上       |
| `has_open_pending()`           | 任意の構造値             | pending statement を含むか                     |
| `score()`                      | search result            | numeric score                                  |
| `similarity(left, right)`      | semantic operands        | 0..1 の embedding 類似度                       |
| `similar_to(left, right, min)` | semantic operands        | 類似度が min 以上か                            |
| `nearest_to(target[, min])`    | text-bearing node stream | embedding 類似度順の semantic match            |

relation、audit、utility 関数は `createDocumentDslqlRuntime` が作る基底 runtime に含まれる。`similarity`、`similar_to`、`nearest_to` は基底 runtime には含まれず、`createSemanticDslqlRuntime` または `createSemanticDocumentDslqlRuntime` が成功した時だけ追加される。

relation traversal は開始 node 自身を返さず、同じ ID を一度だけ返し、cycle で停止する。

### 8.3 Semantic 類似検索

embedding は一級オブジェクトに付随し得る不可視の意味属性である。通常の property namespace には存在せず、path access、列挙、projection、serialization では取得できない。`similarity`、`similar_to`、`nearest_to` だけが関係的に観測する。

- `similarity(left, right)` は cosine similarity を 0..1 に clamp し、小数 4 桁へ丸めた number を返す。
- `similar_to(left, right, threshold)` は `similarity(left, right) >= threshold` と同じ boolean を返す。threshold は 0..1 の number literal で必須とする。
- 現行 evaluator の operand は、current object `.`、`@ID`、空でない string literal に限る。
- string literal は一級の意味オブジェクトとして扱い、semantic runtime preparation 時に embedding を生成する。同一準備内の同じ文字列は一度だけ生成する。
- distinct string literal の worst-case 生成数は `maxOnDemandEmbeddings` で制限し、既定値は 8 とする。キャッシュ済みでも許可判定上は1件として数える。
- `.text` のような動的文字列 path、object literal、`concat(...)` などの合成 expression は、黙示的に embedding しない。
- `select`、`sort_by`、`limit` など同じ object identity を流す演算は不可視属性を維持する。object literal で作った新しい object には embedding を暗黙継承しない。

`nearest_to(target[, threshold])` は候補 stream を embedding 類似度の降順にし、各候補を次の match object へ変換する。

```text
{
  node: original candidate,
  score: number,
  provider: string,
  model: string
}
```

- `target` は `@ID` または空でない string literal に限る。任意 expression の黙示的な文字列化はしない。
- `threshold` は省略可能な 0 以上 1 以下の number literal で、既定は 0。
- 候補は `text`、`description`、`excerpt` などの意味本文を持つ runtime node に限る。
- `@ID` は同じ document runtime の text-bearing node を指す。
- `@ID` が namespace に存在しない場合は unresolved、存在するが意味本文を持たない場合は non-text-bearing として区別する。汎用 runtime で同じ ID の object が複数ある場合は ambiguous として embedding I/O 前に拒否する。
- 同点は元の stream 順を保つ。
- semantic match に再度 `nearest_to()` を適用した場合は `.node` を引き継ぎ、別 target で再順位付けする。
- `score` は cosine similarity を 0..1 に clamp して小数 4 桁へ丸める。
- raw embedding vector は query value として公開せず、model 固有次元を AST 契約へ持ち込まない。

embedding は同期 evaluator の外側で取得する。`createSemanticDocumentDslqlRuntime` が query AST を検査し、literal は文字列値で重複排除する。現行 optimizer は object の到達集合を絞り込まないため、`.` operand または `nearest_to()` がある場合は runtime 内の text-bearing object を保守的に一括準備する。literal 同士または `@ID` 同士だけの比較では、無関係な runtime object を埋め込まない。これにより `evaluateDslqlExpression` と AST transformer は I/O を持たない。

この重複排除は一つの semantic runtime preparation 内の契約であり、process 間または query 間の永続 cache は公開契約に含めない。host が追加 cache を持つ場合も、許可判定は cache miss 時の worst case で行う。

semantic expression の許可判定はキャッシュの温冷に依存させない。将来 optimizer を追加する場合は、式の worst-case distinct embedding 生成上限を `0`、`1`、有限 `N`、証明不能 `∞` として求め、予算内の場合に限って定数伝搬や定数畳み込み後の expression を許可する。例えば `o == "abc"` からの伝搬や `concat("a", "b")` の畳み込みは将来対象にできるが、行依存の `concat(o, "x")` は証明できない限り拒否する。

更新時の伝搬処理を必要とする semantic view は導入しない。

汎用 `DslqlRuntime` には `createSemanticDslqlRuntime` を使う。既定 text selector は llmthink の `text`、`description`、`excerpt` などを認識し、独自 object schema は `selectText(value)` を明示して接続できる。

provider が `none`、通信失敗、vector batch 不正の場合は `DslqlSemanticUnavailableError` とする。semantic query を lexical search や全候補へ暗黙 fallback しない。Analyzer では query result を空にし、実行不能を `semantic_hint/info` で報告する。

## 9. Custom function API

runtime は組み込み名以外の関数を追加できる。custom function は input stream、argument AST、runtime、同じ evaluator を呼ぶ helper を受け取る。

```ts
type DslqlFunction = (context: {
  input: readonly DslqlValue[];
  arguments: readonly DslqlExpression[];
  runtime: DslqlRuntime;
  evaluate(expression, input?): DslqlValue[];
}) => readonly DslqlValue[];
```

argument を eager に先頭一値へ縮退させない。関数側が必要な cardinality を宣言的に検査する。

## 10. DSL 埋め込み

top-level `query` は一行の DSLQL expression を持つ。

```llmthink
query Q1:
  .document.problems[] | select(.id == @P1) | related_decisions()
```

DSL parser は expression の raw text と開始 span を保持し、audit 時に DSLQL parser を適用する。`@ID` は未解決参照監査と LSP reference の対象になる。

Analyzer の `query_results` は DSLQL evaluator が返した順序付き `DslqlValue[]` を `values` にそのまま格納する。scalar、boolean、string、array、object、semantic match のいずれも decision だけへ縮退させない。query expression 自体を embedding した補助順位付け、lexical fallback、固定 score、`nearest_to()` 以外の暗黙再順位付けは行わない。

各 query result は `query_id`、`severity: "hint"`、`values`、`total_value_count`、`truncated` を持つ。Analyzer の raw report は `total_value_count === values.length` かつ `truncated === false` で lossless である。text / HTML presentation が既定上限を適用する場合は新しい report を返し、元 report を変更せず、総数と `truncated: true` によって省略を明示する。

semantic query も同じ query body に書ける。

```llmthink
query Q2:
  .document.steps[].statement | select(.role == "decision") | nearest_to(@P1, 0.5) | limit(10)
```

## 11. 代表 query

特定 problem に関連する decision:

```text
.document.problems[] | select(.id == @P1) | related_decisions() | map({id: .id, text: .text, based_on: .based_on})
```

根拠未接続 decision:

```text
.document.steps[].statement | select(.role == "decision" and len(.based_on) == 0)
```

warning 以上の finding 集約:

```text
.audit | audit_findings("warning") | [.] | map({count: len(), findings: .})
```

現在の document に pending があるか:

```text
.document | has_open_pending()
```

既に ranking 済みの search result の先頭取得:

```text
.search[] | limit(10)
```

特定 problem に意味的に近い decision:

```text
.document.steps[].statement | select(.role == "decision") | nearest_to(@P1, 0.5) | limit(10)
```

## 12. 非目標

- jq 完全互換
- update assignment や source AST の直接 mutation
- evaluator からの外部 storage、network、shell への直接アクセス
- user-defined function 構文
- semantic view とその更新伝搬
- 再帰 descent、join、reduce、group_by
- DSL 内の複数行 query body

AST transformer は新しい AST を返す純粋な host API であり、DSLQL 実行時の mutation 機能ではない。
