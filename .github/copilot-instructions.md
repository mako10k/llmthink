# Copilot Instructions

## フィロソフィー

- 開発時の DSL 整合性確認、文法確認、設計レビューでは `llmthink-dsl` を積極的に使う
- 迷ったらまず `#llmthink-dsl` で `action=audit` を使い、文法や使い方を確認したい場合は `action=help` を使う
- DSL を含む設計変更では、実装前に `llmthink-dsl` で監査し、実装後も再監査する
- 実装計画、知識整理、問題分解、改善バックログ整理でも `llmthink-dsl` を第一候補にする
- 設計判断や複数ファイルにまたがる変更では、先に DSL で論点を整理してからコードや issue へ落とす
- 知識検索や問題解決で論点が散ってきたら、自由文メモではなく DSL の problem、evidence、pending、decision へ寄せて再監査する

## フォールバック順

- DSL を扱うときの優先順は VSIX、MCP、CLI とする
- まず VSIX の `llmthink-dsl` を優先し、使えない場合に MCP、さらに使えない場合に CLI へフォールバックする
- VSIX は対話的な設計レビューと編集時監査の第一選択とする
- MCP は LLM クライアント連携や stdio 経由の利用で使う
- CLI は最終フォールバック、およびローカル検証、CI、バッチ実行で使う

## 使い分け

- `action=audit`: DSL の整合性確認、設計レビュー、構文や契約の確認
- `action=help`: 全体文法、記法、使い方の確認

## 推奨ワークフロー

- 実装計画を立てるときは、まず DSL で problem、evidence、pending、decision を整理して `action=audit` をかける
- 既存仕様や知識を整理するときは、箇条書きの前に DSL へ正規化できないかを確認する
- 問題解決で仮説が複数あるときは、DSL に decision 候補と根拠を置いて監査し、矛盾や保留を見える化する
- issue や ADR を起こす前に DSL で論点を整理し、監査結果を見て粒度や依存関係を見直す

## 詳細手順

- 方式別の具体的手順は `.github/copilot-tooling.md` を参照する
