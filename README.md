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

## Thought CLI

Stateless な単発監査は `audit`、永続化された思考ライフサイクルは `thought` に寄せる。

- `llmthink audit ...`: 単発の DSL 監査
- `llmthink thought draft --id <thought-id> [<file> | --text "...dsl..."] [--from source-thought-id]`: draft の作成・更新
- `llmthink thought relate --id <thought-id> --from source-thought-id`: 既存 thought から関連 thought を作成
- `llmthink thought audit --id <thought-id> [<file> | --text "...dsl..."] [--pretty]`: current draft を監査し、監査結果を保存
- `llmthink thought finalize --id <thought-id> [<file> | --text "...dsl..."]`: 最終結果を保存
- `llmthink thought show --id <thought-id> [summary|draft|final|audit]`: 現在状態の確認
- `llmthink thought history --id <thought-id>`: 変更履歴の確認
- `llmthink thought search <query> [--limit 5]`: 保存済み thought の検索
- `llmthink thought list`: 保存済み thought 一覧

### CLI 設計方針

- 対称性: `draft -> audit -> finalize` を同じ `thought` 配下の動詞で揃える
- 網羅性: 作成、修正、監査、保存、参照、履歴、検索を一通り CLI で閉じる
- 一貫性: すべて `--id <thought-id>` を保存単位にする
- 単純性: 新しいツールは増やさず、既存 `audit` と `thought` の 2 系統に分ける

### Semantic Thought Search

- `llmthink thought search <query>` は persisted thought に対して embedding ベースの semantic search を試みる
- 利用可能なら `ollama/nomic-embed-text` などの provider/model 名を結果に表示する
- 埋め込みが使えない場合は lexical fallback に戻る
- 検索結果は thought 単位に統合し、同じ thought の draft/final 重複は `draft+final` として 1 件にまとめる

### 永続化レイアウト

runtime data は `.llmthink/` 配下に保存する。

```text
.llmthink/
	thoughts/
		<thought-id>/
			thought.json
			history.json
			draft.dsl
			final.dsl
			audits/
				<timestamp>.json
```

- `thought.json`: 現在状態、latest audit、draft/final の参照
- `history.json`: draft 保存、監査保存、finalize の履歴
- `draft.dsl`: 現在の思考ドラフト
- `final.dsl`: 最終保存された思考
- `audits/*.json`: 各監査レポートのスナップショット

### シナリオ

思考ドラフト -> 思考監査 -> 問題があれば修正 -> 再監査 -> 最終保存:

```bash
llmthink thought draft --id review-001 docs/examples/query-assist.dsl
llmthink thought audit --id review-001 --pretty
llmthink thought draft --id review-001 --text "...fixed dsl..."
llmthink thought audit --id review-001 --pretty
llmthink thought finalize --id review-001
```

思考検索 -> 関連思考作成:

```bash
llmthink thought search ADR
llmthink thought relate --id review-002 --from review-001
llmthink thought audit --id review-002 --pretty
```

## MCP / VSIX lifecycle

- MCP は `thought_manage` と `thought_search` を追加し、tool 数を抑えたまま draft / audit / finalize / show / history / list / search を扱う
- MCP は `thought_manage action=relate` で related thought 作成も扱う
- VSIX は command palette から thought draft / relate / audit / finalize / history / search を扱う
- language model tool は増やさず、既存の `llmthink-audit-dsl` は監査と文法ガイダンスに集中させる

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