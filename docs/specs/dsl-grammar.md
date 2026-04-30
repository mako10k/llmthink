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
TopLevelBlock   = FrameworkDecl | DomainDecl | ProblemDecl | StepDecl | QueryDecl ;
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
StepDecl        = "step" Identifier ":" Newline Indent StepBody Dedent ;
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
QueryExprLine   = Identifier "(" [ Identifier { "," Identifier } ] ")" Newline ;
```

---

## 6. 構文制約

- decision は based_on なしでも構文上は許可する
- ただし based_on なしの decision は監査で contract_violation 候補になる
- partition の Others は構文上は通常の Identifier として扱う
- ただし意味論上は補集合扱いの特別ルールを持つ
- step 本文は 1 要素のみを持つ

---

## 7. parser 実装前提

- tokenizer は行頭インデントをトークン化する
- parser はブロック開始キーワードで分岐する
- 各ノードは source span を保持する
- 構文エラーは行番号と列番号を返す

---

## 8. 既知の未確定事項

- 文字列の複数行対応
- query 式の拡張構文
- predicate 式のネスト優先順位
- comments の正式導入