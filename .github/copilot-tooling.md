# Copilot Tooling Guide

## 目的

このファイルは、LLMThink の DSL をどの入口から扱うかの具体手順をまとめる。
方針そのものは `.github/copilot-instructions.md` を正とし、ここでは方式別の操作手順だけを扱う。

## 優先順

1. VSIX
2. MCP
3. CLI

## VSIX を使う場合

- VS Code 上で DSL を開いている場合は VSIX を第一選択にする
- `#llmthink-dsl` を使って `action=audit` を呼び、設計レビューや整合性確認を行う
- 全体文法や使い方を見たいときは `#llmthink-dsl` で `action=help` を使う
- thought 系の対話操作が必要な場合は command palette から `LLMThink: Thought ...` を使う

## MCP を使う場合

- VSIX が使えないが MCP クライアントから stdio 接続できる場合は MCP を使う
- DSL 監査は `dsl` ツールに `action=audit` を渡す
- 文法確認は `dsl` ツールに `action=help` を渡す
- thought のライフサイクル操作は `thought` ツールを使う

## CLI を使う場合

- VSIX と MCP が使えない場合、またはローカル検証、CI、バッチ実行では CLI を使う
- DSL 監査は `llmthink dsl audit ...` を使う
- 文法確認は `llmthink dsl help` を使う
- thought のライフサイクル操作は `llmthink thought ...` を使う

## 判断基準

- エディタ上で即時に確認したいなら VSIX
- LLM クライアントや外部ツール連携なら MCP
- 自動化、再現性、スクリプト実行なら CLI