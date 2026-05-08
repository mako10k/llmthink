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

---

## 3. 字句規則

### 3.1 識別子

- Identifier := 英字で始まり、英数字、ハイフン、アンダースコアを含められる
- 例: P1, DecisionAudit, contradiction-pending

### 3.2 文字列

- String := 二重引用符で囲う
- 改行をまたぐ自由文字列は MVP では扱わない

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
- decision
- based_on
- pending
- query
- requires
- forbids
- warns

---

## 4. トップレベル構文

```ebnf
Document        = { TopLevelBlock } ;
TopLevelBlock   = FrameworkDecl | DomainDecl | ProblemDecl | StepDecl | ImplicitStepDecl | QueryDecl ;
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
DescriptionLine = "description" String Newline ;
```

### 5.3 problem 宣言

```ebnf
ProblemDecl     = "problem" Identifier ":" Newline Indent StringLine Dedent ;
StringLine      = String Newline ;
```

### 5.4 step 宣言

```ebnf
StepDecl        = "step" [Identifier] ":" Newline Indent StepBody Dedent ;
ImplicitStepDecl = StepBody ;
StepBody        = PremiseDecl | ViewpointDecl | PartitionDecl | EvidenceDecl | DecisionDecl | PendingDecl ;
```

### 5.5 premise 宣言

```ebnf
PremiseDecl     = "premise" Identifier ":" Newline Indent StringLine Dedent ;
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
EvidenceDecl    = "evidence" Identifier ":" Newline Indent StringLine Dedent ;
```

### 5.9 decision 宣言

```ebnf
DecisionDecl    = "decision" Identifier ["based_on" ReferenceList] ":" Newline Indent StringLine Dedent ;
ReferenceList   = Identifier { "," Identifier } ;
```

### 5.10 pending 宣言

```ebnf
PendingDecl     = "pending" Identifier ":" Newline Indent StringLine Dedent ;
```

### 5.11 query 宣言

```ebnf
QueryDecl       = "query" Identifier ":" Newline Indent QueryExprLine Dedent ;
QueryExprLine   = DSLQLExpr Newline ;

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

---

## 6. 構文制約

- decision は based_on なしでも構文上は許可する
- ただし based_on なしの decision は監査で contract_violation 候補になる
- partition の Others は構文上は通常の Identifier として扱う
- ただし意味論上は補集合扱いの特別ルールを持つ
- step 本文は 1 要素のみを持つ
- `step:` のように Identifier を省略した場合、parser は内部 Step ID を statement ID から合成して補う
- top-level に StepBody を直接置いた場合も implicit step として扱い、内部 Step ID を statement ID から合成して補う

---

## 7. parser 実装前提

- tokenizer は行頭インデントをトークン化する
- parser はブロック開始キーワードで分岐する
- 各ノードは source span を保持する
- 構文エラーは行番号と列番号を返す

---

## 8. 既知の未確定事項

- 文字列の複数行対応
- predicate 式のネスト優先順位
- comments の正式導入

### 8.1 comments 導入方針

- comments は 2 段階で導入する
- 第一段階では parser が読み飛ばせる自由コメントを導入する
- 第一段階の自由コメントは監査対象外、参照解決対象外とする
- 第二段階では意味を持つ記述を comments ではなく annotation のような第一級の注釈要素として導入する
- 注釈は自由文字列ラベルではなく kind を持つ構造化要素として設計する
- 詳細な設計判断は docs/process/comment-design.dsl を参照する

### 8.2 自由コメントの予定構文

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

### 8.3 注釈の予定構文

- 第二段階の意味付き記述は comment ではなく annotation として導入する
- annotation kind の初期集合は explanation、rationale、caveat、todo とする
- annotation の初期所有先は problem と premise、evidence、decision、pending とする
- viewpoint、partition、framework rule、query への annotation 付与は後続課題とする

```ebnf
AnnotationKind = "explanation" | "rationale" | "caveat" | "todo" ;
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
		annotation caveat:
			"format document は自由コメントを保持しない"
```

### 8.4 parser と formatter の最小差分方針

- 第一段階の parser は文書ループと各ブロック走査で CommentLine を空行同様に読み飛ばす
- 第一段階の AST には自由コメントを保存しない
- 第一段階の formatter は AST から文書を再構成する現行方式を維持し、自由コメントは出力しない
- 第二段階の AST では annotation を owner 配下の構造化配列として保持する
- 第二段階の parser は本文 StringLine の直後に 0 個以上の annotation ブロックを受理する
- 第二段階の formatter は owner 本文の直後に annotation ブロックを出力する

詳細な実装差分は docs/process/comment-implementation-plan.md を参照する
