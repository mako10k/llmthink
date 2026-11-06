# LLMThink VSIX Extension

> リリース: **1.4.0**。Core・Contracts・Server・本体を個別npmパッケージとして配布します。

この拡張は、VS Code 上で編集中の DSL ドキュメントを監査するための最小 VSIX パッケージである。

現行 release version は [1.4.0](https://github.com/mako10k/llmthink/releases/tag/v1.4.0)。

また、Copilot Chat などの language model tools 対応 UI では、DSL 監査ツールとして参照できる。

開発運用ルールは repo の `.github/copilot-instructions.md` を正とする。
利用者としては、必要に応じて `#llmthink-dsl` で `action=audit` や `action=help` を使って DSL を確認できる。

DSLQL 導入後は、query 行に対して LSP の completion と hover が入り、VSIX 側でも DSLQL snippets と syntax highlight が使える。

evidence の匿名 `resource:` block は URL / file / blob locator と任意の digest / MIME / label を編集でき、preview と `.resources[]` query から確認できる。通常 audit は外部 resource を取得しない。

`confidence SOURCE:`、`confidence SOURCE -> DECISION:`、`declared_confidence DECISION:`はLSPのcompletion / hoverとsyntax highlightに対応する。previewでは正確な有理数区間、認識タグ、最弱経路、未解決の複数親aggregation、自己申告値と派生区間の比較を確認できる。

また、DSL Preview コマンドでアクティブな DSL 文書を Markdown ベースの HTML プレビューとして横に表示できる。標準拡張子は `.think` で、既存の `.dsl` も同じ language ID `llmthink` の互換 alias として扱う。プレビューは custom editor として開くため、Markdown Preview に近い別エディタ種別として扱える。右上の editor title action が環境により見えない場合でも、`.think` / `.dsl` 編集中は status bar に `LLMThink Preview` ボタンが出る。プレビュー上部には `elkjs` を使った step 関係の SVG グラフが表示され、role ごとの lane 維持、orthogonal edge routing、overflow-safe なノード文面表示、ノードクリックから元 DSL 行への移動にも対応する。

## 因果・影響と対策の編集

1.4.0では、根拠の `based_on` と作用対象の `acts_on` を分け、
参照ごとの `relation based_on ID:` / `relation acts_on ID:` を扱う。
旧構文の互換性を維持し、因果・影響監査は明示選択で有効になる。

- `llmthink-causal-unknown`: 原因未確定・原因候補・影響連鎖・暫定対策を含む文書を挿入する
- `llmthink-causal-relation`: 既存の `based_on` 参照へ因果関係の詳細を付ける
- `llmthink-action-relation`: 既存の `acts_on` 参照へ作用機序を付ける

```text
decision M based_on E acts_on C:
  "接続返却処理を修正する"
  relation acts_on C:
    kind intervention
    status hypothesis
    mechanism "終了経路で接続を返却する"
```

参照するIDは文書内で宣言し、relationの対象は対応するヘッダーへ先に列挙する。
`status confirmed` には、その関係を支持する `evidence` 参照も記述する。
原因未確定は `pending` と `annotation role: "cause_unknown"` で表し、
現象の `based_on` から参照する。注釈の本文は次行へインデントして記述する。

framework 内に `profile causal-impact-v1` を置くと追加監査が有効になる。
既存文書へ因果・影響監査を暗黙適用しない。Problems の
`review_required` は、因果の真実性や対策の十分性を人・LLMが確認するための指摘であり、
構造がそろっても実効性や作業の実行権限を認定しない。

definition / rename は作用対象・relation詳細・関係のevidence参照も追跡する。
プレビューでは因果の入力辺と作用の出力辺を区別し、作用辺は破線、
反証済みの関係は薄く表示する。

LSPは下記の起動順に従う。PATHや設定で古い外部LSPを選んだ場合、
新構文を扱える版へ更新するか、同梱LSPを明示指定する。
既に開いているVS Codeでは拡張機能更新後にウィンドウを再読み込みする。

## DSLQL 編集支援

- query 行では `.document.problems[]`、`.document.steps[].statement`、`select(...)`、`similarity(...)`、`similar_to(...)`、`nearest_to(...)`、`limit(...)` などの補完が出る
- `query by problem`、`semantic decisions`、`audit warnings` などの snippet を使って基本 query をすぐ挿入できる
- DSLQL の pipe、比較演算子、関数名、`true` / `false` / `null` を syntax highlight する
- 関数補完、hover、syntax highlight の関数名は core の `DSLQL_FUNCTION_SPECS` と被覆検査される
- query の監査結果は evaluator の順序付き `values` を保持し、順位付けは `nearest_to()` を明示した場合だけ行う

## LSP 編集支援

- TextMate grammarはdeclaration、statement role、annotation、resource、confidence、DSLQLを別scopeに分類する
- `step` bodyではstatement role header、evidence内ではresource、query式ではDSLQL functionを文脈別に補完する
- annotation kind、comparison relation、confidence keywordは閉じた語彙だけを補完する
- 参照とquery targetのinline説明は常時inlay hintではなくon-demand hoverを使い、表示ノイズとdocument change時の追加計算を避ける
- workspace横断navigationは別途Issue #1で扱う

## 提供コマンド

- LLMThink: DSL Audit
- LLMThink: DSL Report Show
- LLMThink: DSL Preview
- LLMThink: Thought Draft
- LLMThink: Thought Relate
- LLMThink: Thought Audit
- LLMThink: Thought Finalize
- LLMThink: Thought History
- LLMThink: Thought Search
- LLMThink: Thought List
- LLMThink: Thought Delete

## 提供ツール

- ツール名: llmthink-dsl
- 参照名: #llmthink-dsl
- 入力:
  - action: audit または help
  - dslText: 監査対象の DSL 本文。省略時はアクティブエディタを監査する
  - documentId: 監査レポートに使う任意の文書 ID
  - thoughtId: 再監査や再利用に使う任意の thought ID

## Thought lifecycle

- command palette から thought の draft、relate、audit、finalize、reflect、history、search、list、delete を扱える
- search は persisted thought に対して semantic search を試み、利用可能なら provider/model を結果に表示する
- DSL Audit と #llmthink-dsl の action=audit は自動登録込みで thought-id を返す

## ローカル開発

- npm install
- npm run typecheck
- npm run build

## LSP 起動順

- `llmthink.languageServer.path` で指定した実行ファイルまたはコマンド
- PATH 上の `llmthink-lsp`
- 上記が見つからない場合は VSIX に同梱した `llmthink-lsp.js`

## Problems 診断設定

- `llmthink.diagnostics.minimumSeverity`: 表示する最低 severity。既定値 `hint` は全診断を表示する
- `llmthink.diagnostics.suppressedCategories`: 明示した監査カテゴリを非表示にする
- `llmthink.diagnostics.categorySeverityOverrides`: `semantic_hint` と `contradiction_candidate` を `error` / `warning` / `info` / `hint` / `off` へ変更する
- 既定では監査結果の severity を変更しない。設定変更後は開いている `.think` / `.dsl` 文書を自動で再診断する
- これらはエディタ表示だけを変更し、CLI / MCP の監査レポートや保存済み audit は変更しない

## VSIX パッケージ

- npm run package:vsix

生成物:

- llmthink.vsix

## インストール

- 公開済み VSIX は [GitHub Release v1.4.0](https://github.com/mako10k/llmthink/releases/tag/v1.4.0) の `llmthink-1.4.0.vsix` を使う
- VS Code で Extensions: Install from VSIX... を開き、取得または生成した llmthink.vsix を選ぶ
- 配布物と release 手順は repo の docs/process/release-checklist.md と CHANGELOG.md を参照する

## ライセンス

- repo と VSIX は MPL-2.0 で提供する
- 依存ライブラリはそれぞれのライセンス条件に従う
- MPL-2.0 の全文は repo root の LICENSE および VSIX 同梱 LICENSE を参照する
