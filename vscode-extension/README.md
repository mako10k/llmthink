# LLMThink VSIX Extension

この拡張は、VS Code 上で編集中の DSL ドキュメントを監査するための最小 VSIX パッケージである。

また、Copilot Chat などの language model tools 対応 UI では、DSL 監査ツールとして参照できる。

## 提供コマンド

- LLMThink: Audit Active Document
- LLMThink: Show Last Audit Report

## 提供ツール

- ツール名: llmthink-audit-dsl
- 参照名: #llmthink-audit
- 入力:
	- dslText: 監査対象の DSL 本文。省略時はアクティブエディタを監査する。help dsl を渡すと文法ガイダンスを返す
	- documentId: 監査レポートに使う任意の文書 ID

## ローカル開発

- npm install
- npm run typecheck
- npm run build

## VSIX パッケージ

- npm run package:vsix

生成物:

- llmthink.vsix