# DSL 構文仕様

## 1. 目的

本書は、思考記述 DSL の最小構文を TypeScript 実装向けに固定する。

対象は MVP 構文であり、厳密な完全仕様ではない。目的は parser と AST の設計を先に安定させることである。

---

## 2. 基本方針

- 行ベースのブロック構文を採用する
- インデントで所有関係を表現する
- 役割キーワードでブロック種別を明示する
- 参照は識別子ベースで行う

### 2.1 ファイル拡張子

- 標準拡張子は `.think`
- `.dsl` は同じ構文・AST・意味論を持つ互換 alias
- 両拡張子の VS Code language ID は `llmthink`
- 拡張子は parser 入力の構文を変えず、文書 ID と暗黙 thought ID の導出時には取り除く
- 同じ directory に同名の `.think` と `.dsl` が共存する場合だけ、履歴混在を避けるため暗黙 thought ID 導出を拒否する

---

## 3. 字句規則

### 3.1 識別子

- Identifier := 英字で始まり、英数字、ハイフン、アンダースコアを含められる
- 例: P1, DecisionAudit, contradiction-pending

### 3.2 文字列

- String := 二重引用符で囲う
- TextBody := 1 行 String または block text
- block text は `|` marker の次に、より深いインデントの複数行を置く

### 3.3 キーワード

- framework
- domain
- description
- problem
- step
- premise
- viewpoint
- axis
- partition
- evidence
- resource
- url
- file
- blob
- digest
- mime
- label
- decision
- comparison
- based_on
- relation
- preferred_over
- weaker_than
- incomparable
- counterexample_to
- pending
- confidence
- estimate
- range
- epistemic
- known
- estimated
- unknown
- default
- query
- requires
- forbids
- warns
- annotation
- explanation
- rationale
- status
- caveat
- todo
- orphan_future
- orphan_reference

---

## 4. トップレベル構文

```ebnf
Document        = { TopLevelBlock } ;
TopLevelBlock   = FrameworkDecl | DomainDecl | ProblemDecl | StepDecl | ImplicitStepDecl | ConfidenceDecl | QueryDecl ;
```

トップレベルでは、複数の domain や query を宣言してよい。

---

## 5. 構文要素

### 5.1 framework 宣言

```ebnf
FrameworkDecl   = "framework" Identifier [":" Newline Indent { FrameworkRule } Dedent] ;
FrameworkRule   = RequiresRule | ForbidsRule | WarnsRule ;
RequiresRule    = "requires" RequirementExpr Newline ;
ForbidsRule     = "forbids" Identifier Newline ;
WarnsRule       = "warns" Identifier Newline ;
RequirementExpr = Identifier { ("or" | "and") Identifier } ;
```

### 5.2 domain 宣言

```ebnf
DomainDecl      = "domain" Identifier ":" Newline Indent DescriptionLine Dedent ;
DescriptionLine = "description" (String | BlockMarker Newline Indent TextLine { TextLine | BlankLine } Dedent) ;
```

### 5.3 problem 宣言

```ebnf
ProblemDecl     = "problem" Identifier ":" Newline Indent TextBody { AnnotationDecl } Dedent ;
TextBody        = StringLine | BlockText ;
StringLine      = String Newline ;
BlockText       = BlockMarker Newline Indent TextLine { TextLine | BlankLine } Dedent ;
BlockMarker     = "|" ;
TextLine        = { AnyCharExceptNewline } Newline ;
BlankLine       = Newline ;
```

### 5.4 step 宣言

```ebnf
StepDecl        = "step" [Identifier] ":" Newline Indent StepBody Dedent ;
ImplicitStepDecl = StepBody ;
StepBody        = PremiseDecl | ViewpointDecl | PartitionDecl | EvidenceDecl | DecisionDecl | ComparisonDecl | PendingDecl ;
```

### 5.5 premise 宣言

```ebnf
PremiseDecl     = "premise" Identifier ":" Newline Indent TextBody { AnnotationDecl } Dedent ;
```

### 5.6 viewpoint 宣言

```ebnf
ViewpointDecl   = "viewpoint" Identifier ":" Newline Indent AxisLine Dedent ;
AxisLine        = "axis" Identifier Newline ;
```

### 5.7 partition 宣言

```ebnf
PartitionDecl   = "partition" Identifier "on" Identifier "axis" Identifier ":" Newline Indent { PartitionMember } Dedent ;
PartitionMember = Identifier ":=" PredicateExpr Newline ;
PredicateExpr   = Identifier | "not" Identifier | Identifier { ("and" | "or") Identifier } ;
```

### 5.8 evidence 宣言

```ebnf
EvidenceDecl    = "evidence" Identifier ":" Newline Indent TextBody { ResourceDecl | AnnotationDecl } Dedent ;
ResourceDecl    = "resource" ":" Newline Indent ResourceLocator { ResourceMetadata } Dedent ;
ResourceLocator = ("url" | "file" | "blob") String Newline ;
ResourceMetadata = ("digest" | "mime" | "label") String Newline ;
```

### 5.9 decision 宣言

```ebnf
DecisionDecl    = "decision" Identifier ["based_on" ReferenceList] ":" Newline Indent TextBody { AnnotationDecl } Dedent ;
ReferenceList   = Identifier { "," Identifier } ;
```

### 5.10 pending 宣言

```ebnf
PendingDecl     = "pending" Identifier ":" Newline Indent TextBody { AnnotationDecl } Dedent ;

AnnotationDecl  = "annotation" AnnotationKind ":" Newline Indent TextBody Dedent ;
AnnotationKind  = "explanation" | "rationale" | "status" | "caveat" | "todo" | "orphan_future" | "orphan_reference" ;
```

### 5.11 comparison 宣言

```ebnf
ComparisonDecl  = "comparison" Identifier "on" Identifier "viewpoint" Identifier "relation" ComparisonRelation Identifier "," Identifier ":" Newline Indent TextBody { AnnotationDecl } Dedent ;
ComparisonRelation = "preferred_over" | "weaker_than" | "incomparable" | "counterexample_to" ;
```

### 5.12 confidence 宣言

```ebnf
ConfidenceDecl       = ConfidenceSourceDecl | ConfidenceEdgeDecl | DeclaredConfidenceDecl ;
ConfidenceSourceDecl = "confidence" Identifier ":" Newline Indent ConfidenceSourceBody Dedent ;
ConfidenceEdgeDecl   = "confidence" Identifier "->" Identifier ":" Newline Indent ConfidenceEdgeBody Dedent ;
DeclaredConfidenceDecl = "declared_confidence" Identifier ":" Newline Indent DeclaredConfidenceBody Dedent ;
ConfidenceSourceBody = DefaultConfidence | SourceKeywordConfidence | ExplicitConfidence ;
ConfidenceEdgeBody   = DefaultConfidence | EdgeKeywordConfidence | ExplicitConfidence ;
DeclaredConfidenceBody = SourceKeywordConfidence | ExplicitConfidence ;
DefaultConfidence    = "default" Newline ;
SourceKeywordConfidence = "keyword" SourceConfidenceKeyword Newline ;
EdgeKeywordConfidence = "keyword" EdgeConfidenceKeyword Newline ;
SourceConfidenceKeyword = "defined" | "common_fact" | "strong_assumption" | "rough_assumption" | "unsupported_assumption" | "unlikely_assumption" | "likely_refuted" | "refuted" ;
EdgeConfidenceKeyword = "exact_transform" | "reliable_inference" | "strong_inference" | "approximate_inference" | "unsupported_inference" | "weak_inference" | "likely_invalid" | "invalid" ;
ExplicitConfidence   = ConfidenceField ConfidenceField ConfidenceField ;
ConfidenceField      = EstimateLine | RangeLine | EpistemicLine ;
EstimateLine         = "estimate" Rational Newline ;
RangeLine            = "range" Rational ".." Rational Newline ;
EpistemicLine        = "epistemic" ("known" | "estimated" | "unknown") Newline ;
Rational             = UnsignedInteger "/" PositiveInteger ;
```

- source form は入力端の命題評価、edge form は source から target decision への scoring support 分類を表す
- explicit form の 3 field は順不同だが、各 1 回だけ必須とする
- `default` は単独 field とし、`support-trace-v1` の幅付き既定値を選ぶ
- `keyword IDENTIFIER` も単独 field とし、source form は source keyword、edge form は edge keyword
  だけを受理する。展開表は ADR-0015 の `support-trace-v1` を正とする
- keyword 展開後も `origin keyword`、`profile_id`、`keyword_id` を保持する
- `declared_confidence`はincoming scoring edgeを持つderived decisionだけを対象とし、source用keyword
  またはexplicit assessmentを取る。`default`は許さない
- rational は正確に既約化し、`0/1 <= lower <= estimate <= upper <= 1/1` を要求する
- `known` は `lower == estimate == upper` の point interval だけを許す
- `unknown` は数値を欠損させず、数値区間と直交するタグとして扱う
- edge source は target decision の `based_on` に含まれていなければならない
- `based_on` だけから scoring edge を暗黙生成しない

### 5.13 query 宣言

```ebnf
QueryDecl       = "query" Identifier ":" Newline Indent QueryExprLine Dedent ;
QueryExprLine   = DSLQLExpr Newline ;

DSLQLExpr       = PipeExpr ;
PipeExpr        = OrExpr { "|" OrExpr } ;
OrExpr          = AndExpr { "or" AndExpr } ;
AndExpr         = ComparisonExpr { "and" ComparisonExpr } ;
ComparisonExpr  = UnaryExpr [ ("==" | "!=" | ">" | ">=" | "<" | "<=" | "in") UnaryExpr ] ;
UnaryExpr       = "not" UnaryExpr | PrimaryExpr ;
PrimaryExpr     = PathExpr | Reference | Literal | ArrayExpr | ObjectExpr | FunctionCall | "(" DSLQLExpr ")" ;
PathExpr        = CurrentPath | RootPath ;
CurrentPath     = "." [ Identifier ["?"] ] { PathSegment } ;
RootPath        = "$" { PathSegment } ;
PathSegment     = "." Identifier ["?"] | "[]" ["?"] | "[" UnsignedInteger "]" ["?"] | "[" String "]" ["?"] ;
Reference       = "@" Identifier ;
FunctionCall    = Identifier "(" [ ArgList ] ")" ;
ArgList         = DSLQLExpr { "," DSLQLExpr } ;
ObjectExpr      = "{" [ ObjectField { "," ObjectField } ] "}" ;
ObjectField     = (Identifier | String) ":" DSLQLExpr ;
ArrayExpr       = "[" [ DSLQLExpr { "," DSLQLExpr } ] "]" ;
Literal         = String | Number | "true" | "false" | "null" ;
```

DSLQL の評価意味論、組み込み関数、semantic operand、遅延 embedding 予算は [dslql.md](dslql.md) を正とする。

---

## 6. 構文制約

- decision は based_on なしでも構文上は許可する
- based_on の参照先 Identifier は declared problem id または statement id を取れる
- ただし based_on なしの decision は監査で contract_violation 候補になる
- partition の Others は構文上は通常の Identifier として扱う
- ただし意味論上は補集合扱いの特別ルールを持つ
- step 本文は 1 要素のみを持つ
- `step:` のように Identifier を省略した場合、parser は内部 Step ID を statement ID から合成して補う
- top-level に StepBody を直接置いた場合も implicit step として扱い、内部 Step ID を statement ID から合成して補う
- evidence text は resource の有無にかかわらず必須で、resource は evidence 本文の後に匿名 block として 0 個以上置ける
- resource は url / file / blob の locator をちょうど 1 つ持ち、digest / mime / label はそれぞれ 0 または 1 個だけ持つ
- url は absolute HTTP/HTTPS、blob と digest は `sha256:<64 hex>`、mime は parameter なしの `type/subtype`、label は空でない文字列とする
- blob と digest の併記、resource field の重複、未知 field、named resource を拒否する
- parser と通常 audit の resource 検査は I/O を行わず、URL 到達性、file existence、content digest、MIME sniff は検査しない
- resource は匿名 structural value であり、宣言 ID namespace、`@ID`、`based_on`、semantic operand の対象にしない
- confidence 宣言は ID を所有せず、宣言 ID namespace へ追加しない
- confidence の source node 評価は入力端だけに明示でき、中間・結論 node は scoring edge から派生計算する
- declared confidenceはderived confidenceを上書きせず、別の自己申告assessmentとして保持する
- confidence graph の cycle、未解決参照、scope 不一致は `unknown` ではなく `uncomputable` とする
- confidence 結果は監査補助であり、真偽、audit severity、finalize、承認、公開の authority にしない

---

## 7. parser 実装前提

- tokenizer は行頭インデントをトークン化する
- parser はブロック開始キーワードで分岐する
- 各ノードは source span を保持する
- 構文エラーは行番号と列番号を返す

---

## 8. 既知の未確定事項

- block text の末尾改行保持規則
- predicate 式のネスト優先順位
- comments の正式導入

### 8.1 複数行 text の方針

- text-bearing field は 1 行 quoted text か block text のどちらかを取る
- block text は `|` marker の次行以降を共通インデント除去して `\n` 連結する
- formatter は改行を含む text を block text、1 行 text を quoted text に正規化する
- annotation status は機械解釈対象なので複数行 block text を使わない

### 8.2 comments 導入方針

- comments は 2 段階で導入する
- 第一段階では parser が読み飛ばせる自由コメントを導入する
- 第一段階の自由コメントは監査対象外、参照解決対象外とする
- 第二段階では意味を持つ記述を comments ではなく annotation のような第一級の注釈要素として導入する
- 注釈は自由文字列ラベルではなく kind を持つ構造化要素として設計する
- 詳細な設計判断は docs/process/comment-design.dsl を参照する

### 8.3 自由コメントの予定構文

- 第一段階の自由コメントは行頭インデントの後に `#` を置く独立行コメントとする
- 自由コメントは空行と同じ位置に出現でき、parser は意味解析せず読み飛ばす
- 第一段階では末尾行コメントは導入しない
- 第一段階では format document 実行時に自由コメントは保持しない

```ebnf
CommentLine = [Indent] "#" { AnyCharExceptNewline } Newline ;
Document    = { BlankLine | CommentLine | TopLevelBlock } ;
```

例:

```llmthink
# 文書全体の補足
problem P1:
	"コメント導入方針を決める"

	# 次の step は parser 実装差分を整理する
step S1:
	evidence EV1:
		"自由コメントは第一段階では AST へ載せない"
```

### 8.4 注釈構文

- 意味付き記述は comment ではなく annotation として導入する
- annotation kind は explanation、rationale、status、caveat、todo、orphan_future、orphan_reference の閉じた集合とする
- annotation の現行所有先は problem と premise、evidence、decision、comparison、pending とする
- viewpoint、partition、framework rule、query への annotation 付与は後続課題とする

```ebnf
AnnotationKind = "explanation" | "rationale" | "status" | "caveat" | "todo" | "orphan_future" | "orphan_reference" ;
AnnotationDecl = "annotation" AnnotationKind ":" Newline Indent StringLine Dedent ;
```

例:

```llmthink
problem P1:
	"コメント導入方針を決める"
	annotation rationale:
		"自由コメントと注釈を分離すると役割衝突を避けやすい"

step S1:
	decision D1 based_on EV1:
		"第一段階では # 行コメントのみを導入する"
		annotation status:
			"superseded"
		annotation caveat:
			"format document は自由コメントを保持しない"
		annotation orphan_reference:
			"旧案を参照用に残す"
```

### 8.4 parser と formatter の最小差分方針

- 第一段階の parser は文書ループと各ブロック走査で CommentLine を空行同様に読み飛ばす
- 第一段階の AST には自由コメントを保存しない
- 第一段階の formatter は AST から文書を再構成する現行方式を維持し、自由コメントは出力しない
- 第二段階の AST では annotation を owner 配下の構造化配列として保持する
- 第二段階の parser は本文 StringLine の直後に 0 個以上の annotation ブロックを受理する
- 第二段階の formatter は owner 本文の直後に annotation ブロックを出力する

詳細な実装差分は docs/process/comment-implementation-plan.md を参照する
