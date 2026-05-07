# Comment Implementation Plan

## 1. Scope

- 第一段階は自由コメントのみを入れる
- 第二段階は annotation を problem と text-bearing statement に限定して入れる
- text-bearing statement は premise、evidence、decision、pending を指す

## 2. Phase 1: Free Comments

### Parser

- `parseDocument` の先頭ループで空行判定と同列に comment 行判定を追加する
- `parseFramework` と `parsePartition` のような複数行走査でも comment 行を読み飛ばす
- `parseDomain`、`parseProblem`、`parseTextStatement`、`parseDecision`、`parseQuery` は owner 本文の直後に comment 行が来ても壊れないよう、本文取得前後の comment 無視規則を追加する

### AST

- 第一段階では AST 変更なし

### Formatter

- 第一段階では AST 再構成方式を維持する
- `format document` は comment を保持しない
- これは lossless formatter ではなく normalize formatter として扱う

### LSP/Audit

- 第一段階では comment を参照解決対象に含めない
- hover、rename、references、document symbols は comment を無視する
- audit も comment を入力ノイズとして無視する

## 3. Phase 2: Annotation

### Syntax

```llmthink
annotation rationale:
  "根拠の説明"
```

### AST

- `AnnotationKind = "explanation" | "rationale" | "caveat" | "todo"` を追加する
- `Annotation { kind, text, span }` を追加する
- `ProblemDecl` に `annotations: Annotation[]` を追加する
- `PremiseStatement`、`EvidenceStatement`、`DecisionStatement`、`PendingStatement` に `annotations: Annotation[]` を追加する

### Parser

- owner の本文 `StringLine` を読んだ後に、同じ owner 配下の `annotation` ブロックを 0 個以上読む共通 helper を追加する
- viewpoint と partition では phase 2 の時点では `annotation` を受理しない

### Formatter

- `problem` と text-bearing statement を出力する helper に annotation 出力を追加する
- annotation は owner 本文の直後に元の順序で出力する

### LSP/Audit

- completion に annotation keyword と kind 候補を追加する
- hover では annotation kind の説明を出せるようにする
- audit では少なくとも `todo` と `caveat` を補助情報として扱える余地を残す
- rename と references は annotation 本文ではなく owner の識別子だけを対象にする

## 4. Deferred Items

- 末尾行コメント
- viewpoint と partition への annotation
- free comment の trivia preservation
- annotation を framework rule や query に付ける方式