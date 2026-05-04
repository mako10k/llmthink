framework LspExtensionReview:
  requires problem or decision
  requires pending or evidence

domain LspEditing:
  description "LLMThink DSL の編集体験と LSP 拡張方針を整理する"

problem P1:
  "DSL 編集に必要な主要ナビゲーション機能を整理する"

problem P2:
  "参照解決を厳密化する対象を整理する"

problem P3:
  "コードアクションで提供する修正支援を整理する"

step S1:
  premise PR1:
    "LSP 拡張は parser と audit の既存 AST を流用し、小さい差分で積み上げるべきである"

step S2:
  evidence EV1:
    "アウトライン、定義ジャンプ、参照検索、rename が揃うと DSL 文書の編集回遊性が上がる"

step S3:
  evidence EV2:
    "query 引数、decision based_on、partition on の参照は AST と行テキストから復元できる"

step S4:
  evidence EV3:
    "監査結果の suggestion や parse error 行番号を code action に接続すると修正導線が短くなる"

step S5:
  pending PD1:
    "framework requires、forbids、warns の値を role と識別子のどちらとして扱うかは将来さらに厳密化が必要である"

step S6:
  decision D1 based_on PR1, EV1:
    "第一段階では rename、definition、references、document highlight、outline を AST ベースで提供する"

step S7:
  decision D2 based_on PR1, EV2:
    "第二段階では query 引数、partition domain、viewpoint axis、framework rule を index 対象へ追加する"

step S8:
  decision D3 based_on PR1, EV3:
    "第三段階では format document と audit diagnostics に接続した code action を提供する"

query Q1:
  related_decisions(P1)

query Q2:
  related_decisions(P2)

query Q3:
  related_decisions(P3)