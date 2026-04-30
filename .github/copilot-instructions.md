# Copilot Instructions

## 開発運用

- 開発時の DSL 整合性確認、文法確認、設計レビューでは `llmthink-dsl` を積極的に使う
- 迷ったらまず `#llmthink-dsl` で `action=audit` を使い、文法や使い方を確認したい場合は `action=help` を使う
- DSL を含む設計変更では、実装前に `llmthink-dsl` で監査し、実装後も再監査する

## 使い分け

- `action=audit`: DSL の整合性確認、設計レビュー、構文や契約の確認
- `action=help`: 全体文法、記法、使い方の確認