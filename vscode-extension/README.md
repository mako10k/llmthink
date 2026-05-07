# LLMThink VSIX Extension

この拡張は、VS Code 上で編集中の DSL ドキュメントを監査するための最小 VSIX パッケージである。

また、Copilot Chat などの language model tools 対応 UI では、DSL 監査ツールとして参照できる。

開発運用ルールは repo の `.github/copilot-instructions.md` を正とする。
利用者としては、必要に応じて `#llmthink-dsl` で `action=audit` や `action=help` を使って DSL を確認できる。

DSLQL 導入後は、query 行に対して LSP の completion と hover が入り、VSIX 側でも DSLQL snippets と syntax highlight が使える。
また、DSL Preview コマンドでアクティブな DSL 文書を Markdown ベースの HTML プレビューとして横に表示できる。

## DSLQL 編集支援

- query 行では `.problems[]`、`.steps[]`、`select(...)`、`map(...)`、`sort_by(...)`、`limit(...)`、`unique_by(...)` などの補完が出る
- `query by problem`、`audit warnings` などの snippet を使って基本 query をすぐ挿入できる
- DSLQL の pipe、比較演算子、関数名、`true` / `false` / `null` を syntax highlight する

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

## VSIX パッケージ

- npm run package:vsix

生成物:

- llmthink.vsix
