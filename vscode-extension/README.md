# LLMThink VSIX Extension

この拡張は、VS Code 上で編集中の DSL ドキュメントを監査するための最小 VSIX パッケージである。

また、Copilot Chat などの language model tools 対応 UI では、DSL 監査ツールとして参照できる。

開発運用ルールは repo の `.github/copilot-instructions.md` を正とする。
利用者としては、必要に応じて `#llmthink-dsl` で `action=audit` や `action=help` を使って DSL を確認できる。

## 提供コマンド

- LLMThink: DSL Audit
- LLMThink: DSL Report Show
- LLMThink: Thought Draft
- LLMThink: Thought Relate
- LLMThink: Thought Audit
- LLMThink: Thought Finalize
- LLMThink: Thought History
- LLMThink: Thought Search
- LLMThink: Thought List

## 提供ツール

- ツール名: llmthink-dsl
- 参照名: #llmthink-dsl
- 入力:
  - action: audit または help
  - dslText: 監査対象の DSL 本文。省略時はアクティブエディタを監査する
  - documentId: 監査レポートに使う任意の文書 ID

## Thought lifecycle

- command palette から thought の draft、relate、audit、finalize、history、search、list を扱える
- search は persisted thought に対して semantic search を試み、利用可能なら provider/model を結果に表示する

## ローカル開発

- npm install
- npm run typecheck
- npm run build

## VSIX パッケージ

- npm run package:vsix

生成物:

- llmthink.vsix
