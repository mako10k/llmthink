# LSP editor assistance

## Classification

- VSIX は TextMate grammar で declaration、statement role、annotation kind、resource field、confidence value、DSLQL function / operator / reference を分類する
- syntax classification は client-side grammar とし、document change ごとの追加 server request を発生させない
- grammar の DSLQL function 集合は core の `DSLQL_FUNCTION_SPECS` と被覆検査する

## Completion

- DSLQL completion は parser が query expression と判定した位置だけで、root、function、projection、snippet を返す
- `step` body では statement role の header snippet だけを返す
- annotation kind、comparison relation、confidence epistemic tag / profile keyword は閉じた語彙を返す
- evidence body では匿名 `resource:` snippet、resource block では locator / metadata field を返す
- 文脈を特定できない位置では従来の keyword / query function 一覧へ fallback する

completion は明示要求時に現在文書だけを解析する。background index、embedding、外部resource I/Oは行わない。

## Inline explanation

参照とquery targetの説明には、常時表示のinlay hintではなく既存のon-demand hoverを使う。

- DSL本文にはIDと参照が既に明示され、常時inlayは情報を重複させやすい
- hoverは利用者が必要な位置だけを要求するため、小さい文書の表示ノイズと更新コストを増やさない
- audit findingはProblems diagnosticとcode actionで扱い、inlayへ重複表示しない

derived confidenceやcross-file identityなど、本文に存在しない短い値を安定して表示する必要が確認された場合に、inlay hintを別Issueで再評価する。

## Boundary

- workspace横断symbol index、definition、references、renameはIssue #1の範囲とする
- semantic token providerは、TextMateでは表現できないAST依存分類が必要になった時点で再評価する
- startup時に文書全体を先読みせず、既存のopen/change診断と明示的なcompletion / hover requestの範囲を維持する
