# llmthink

思考記述 DSL と思考監査エンジンの設計ドキュメントを管理するリポジトリ。

## 構成

- docs/specs: 要求仕様
- docs/process: 運用ルールとプロセス文書
- docs/adr: Architecture Decision Record
- docs/examples: DSL サンプル
- schemas: 監査結果などの機械可読スキーマ
- src: 共通監査コア、CLI、MCP 実装
- vscode-extension: VSIX 拡張パッケージ

## 主要ドキュメント

- docs/specs/requirements.md
- docs/process/adr-rules.md
- docs/adr/0001-thought-audit-engine.md
- docs/adr/0002-audit-severity-model.md
- docs/adr/0003-mece-as-structural-discipline.md
- docs/adr/0004-unified-interface-architecture.md
- docs/specs/ui-architecture.md
- docs/examples/dsl-samples.md
- docs/examples/audit-output-sample.json
- schemas/audit-result.schema.json

## 運用方針

- 重要な設計判断は docs/adr に ADR として記録する
- 要求仕様の変更は ADR と整合させる
- 監査出力の契約変更は schemas を更新する

## 開発コマンド

- npm install
- npm run typecheck
- npm run build
- npm run audit -- docs/examples/contradiction-pending.dsl
- npm run audit -- docs/examples/contradiction-pending.dsl --pretty
- npm run audit -- --help dsl
- npm run verify-examples
- npm run mcp
- npm run typecheck:extension
- npm run build:extension

## 埋め込み設定

- 既定の埋め込みプロバイダは Ollama
- 埋め込み取得に失敗した場合、semantic_hint と query_result の順位付けはヒューリスティックへフォールバックする

### Windows + WSL で Ollama を使う場合

- Windows 側に Ollama をインストールする
- Windows 側で `ollama serve` もしくは `ollama app.exe` を起動する
- WSL から `curl http://127.0.0.1:11434/api/version` が通ることを確認する
- 埋め込みモデルが未取得なら `ollama pull nomic-embed-text` を実行する

WSL が mirrored networking の場合は、Windows ユーザーの `.wslconfig` に次を入れて WSL を再起動する

```ini
[wsl2]
networkingMode=mirrored
hostAddressLoopback=true
```

確認コマンド:

- `curl http://127.0.0.1:11434/api/version`
- `curl http://127.0.0.1:11434/api/tags`
- `npm run audit -- docs/examples/query-assist.dsl --pretty`

利用可能な環境変数:

- LLMTHINK_EMBEDDING_PROVIDER: `ollama` | `openai` | `none`
- LLMTHINK_EMBEDDING_TIMEOUT_MS: 埋め込み API のタイムアウトミリ秒。既定は `3000`
- OLLAMA_BASE_URL: Ollama API のベース URL。既定は `http://127.0.0.1:11434`
- OLLAMA_EMBED_MODEL: Ollama の埋め込みモデル名。既定は `nomic-embed-text`
- OPENAI_BASE_URL: OpenAI 互換 embeddings API のベース URL。既定は `https://api.openai.com/v1`
- OPENAI_API_KEY: OpenAI 互換 embeddings API の認証キー
- OPENAI_EMBED_MODEL: OpenAI 互換 embeddings API のモデル名。既定は `text-embedding-3-small`

例:

- `OLLAMA_EMBED_MODEL=nomic-embed-text npm run audit -- docs/examples/query-assist.dsl --pretty`
- `LLMTHINK_EMBEDDING_PROVIDER=openai OPENAI_API_KEY=... npm run audit -- docs/examples/query-assist.dsl --pretty`
- `LLMTHINK_EMBEDDING_PROVIDER=none npm run verify-examples`

## Query 埋め込みの扱い

- `related_decisions(P1)` のような query は、式そのものに加えて参照先 problem の本文も埋め込み対象に含める
- これにより、`related_decisions(...)` という固定文字列ではなく、問題文脈に近い decision が上位に来やすくなる

## DSL ヘルプ

- CLI では `llmthink audit --help dsl` で全体文法を表示する
- MCP/VSIX では既存の `text` または `dslText` に `help dsl` を渡す
- 文法エラー時は、関連する理由、期待される構文、その場で呼べる help 導線を fatal report に含める

## ライセンス

- 本リポジトリは UNLICENSED 扱いであり、利用・再配布・改変には権利者の事前許可が必要