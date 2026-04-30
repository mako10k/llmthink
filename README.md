# llmthink

思考記述 DSL と思考監査エンジンの設計ドキュメントを管理するリポジトリ。

## 構成

- docs/specs: 要求仕様
- docs/process: 運用ルールとプロセス文書
- docs/adr: Architecture Decision Record
- docs/examples: DSL サンプル
- schemas: 監査結果などの機械可読スキーマ

## 主要ドキュメント

- docs/specs/requirements.md
- docs/process/adr-rules.md
- docs/adr/0001-thought-audit-engine.md
- docs/examples/dsl-samples.md
- schemas/audit-result.schema.json

## 運用方針

- 重要な設計判断は docs/adr に ADR として記録する
- 要求仕様の変更は ADR と整合させる
- 監査出力の契約変更は schemas を更新する