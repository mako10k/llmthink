# llmthink

思考記述 DSL と思考監査エンジンの設計ドキュメントを管理するリポジトリ。

現行 release version は 0.4.3。

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
- docs/process/release-checklist.md
- docs/process/version-bump-rules.dsl
- CHANGELOG.md
- docs/adr/0001-thought-audit-engine.md
- docs/adr/0002-audit-severity-model.md
- docs/adr/0003-mece-as-structural-discipline.md
- docs/adr/0004-unified-interface-architecture.md
- docs/specs/ui-architecture.md
- docs/specs/dslql.md
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
- npm run cli -- dsl audit docs/examples/contradiction-pending.dsl
- npm run cli -- dsl audit docs/examples/contradiction-pending.dsl --pretty
- npm run cli -- dsl help
- npm run cli -- dsl help samples query-assist detail
- npm run preview:html -- docs/process/help-navigation-design.dsl --out /tmp/llmthink-preview.html
- npm run verify-examples
- npm run mcp
- npm run typecheck:extension
- npm run build:extension
- npm run package:vsix

## 配布

- VS Code 拡張の配布物は vscode-extension/llmthink.vsix を生成して配布する
- 生成コマンドは npm run package:vsix
- release 手順、検査項目、tag 付与順は docs/process/release-checklist.md を正とする
- 変更内容の公開履歴は CHANGELOG.md を正とする

## Thought CLI

CLI は resource-first に `dsl` と `thought` の 2 系統へ寄せる。

- `llmthink dsl audit ...`: 自動登録込みの DSL 監査。thought-id を返す
- `llmthink dsl help`: DSL 全体文法の表示
- `llmthink thought draft --id <thought-id> [<file> | --text "...dsl..."] [--from source-thought-id]`: draft の作成・更新
- `llmthink thought relate --id <thought-id> --from source-thought-id`: 既存 thought から関連 thought を作成
- `llmthink thought audit --id <thought-id> [<file> | --text "...dsl..."] [--pretty]`: current draft を監査し、監査結果を保存
- `llmthink thought finalize --id <thought-id> [<file> | --text "...dsl..."]`: 最終結果を保存
- `llmthink thought delete --id <thought-id>`: 保存済み thought を削除
- `llmthink thought show --id <thought-id> [summary|draft|final|audit]`: 現在状態の確認
- `llmthink thought history --id <thought-id>`: 変更履歴の確認
- `llmthink thought search <query> [--limit 5]`: 保存済み thought の検索
- `llmthink thought list`: 保存済み thought 一覧

### CLI 設計方針

- 対称性: top-level を `dsl` / `thought` に固定し、その下を動詞で揃える
- 網羅性: 作成、修正、監査、保存、参照、履歴、検索を一通り CLI で閉じる
- 一貫性: resource-first の語順で `dsl <action>` / `thought <action>` に統一する
- 単純性: top-level resource は 2 個に限定する

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
- `history.json`: draft 保存、監査保存、finalize などの履歴
- `draft.dsl`: 現在の思考ドラフト
- `final.dsl`: 最終保存された思考
- `audits/*.json`: 各監査レポートのスナップショット

### シナリオ

自動登録付き監査 -> 修正 -> 再監査 -> 最終保存:

```bash
llmthink dsl audit docs/examples/query-assist.dsl --pretty
llmthink thought draft --id review-001 --text "...fixed dsl..."
llmthink thought audit --id review-001 --pretty
llmthink thought finalize --id review-001
```

- 初回の `dsl audit` は保存込みで `thought_id` を返す
- 以後の修正、再監査、削除はその `thought_id` または `thought list` / `thought search` の結果を使う

思考検索 -> 関連思考作成:

```bash
llmthink thought search ADR
llmthink thought relate --id review-002 --from review-001
llmthink thought audit --id review-002 --pretty
```

## MCP / VSIX lifecycle

- MCP は `dsl` と `thought` の 2 ツールに統一する
- `dsl` は `action=audit|help` を扱い、`audit` は保存込みで thought-id を返す
- `thought` は `action=draft|relate|audit|finalize|reflect|delete|show|history|search|list` を扱う
- VSIX は `llmthink.dsl*` と `llmthink.thought*` の command id に統一する
- language model tool は `llmthink-dsl` に統一し、DSL 監査と文法ガイダンスに集中させる
- Copilot 向けの開発運用ルールは `.github/copilot-instructions.md` を正とする
- 利用者としては、必要に応じて `#llmthink-dsl` で `action=audit` や `action=help` を使って DSL を確認できる

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
- `npm run cli -- dsl audit docs/examples/query-assist.dsl --pretty`

## Runtime Config

設定ファイルの読み込み順は次のとおりです。

1. ワークスペース: カレントディレクトリまたは対象ファイルから親方向に探索した `.llmthinkrc`
2. ユーザ: `XDG_CONFIG_HOME/llmthink/config.json`、なければ `~/.llmthinkrc`
3. システム: `/etc/llmthinkrc`

thought の保存先も同じ優先順で決まります。既定値は次のとおりです。

- workspace: `.llmthinkrc` が見つかったディレクトリ直下の `.llmthink/`。設定ファイルがない場合は実行ディレクトリ直下の `.llmthink/`
- user: `XDG_STATE_HOME/llmthink`、なければ `~/.llmthink`
- system: `/var/lib/llmthink`

CLI では保存先を直接上書きできます。

- `--config path/to/.llmthinkrc`
- `--storage-domain workspace|user|system`
- `--storage-path path/to/storage-root`

現在どの設定が解決されているかは `llmthink config show` で確認できます。対象ファイルを付けると、そのファイル基準のワークスペース探索結果を表示します。

- `llmthink config show`
- `llmthink config show docs/examples/query-assist.dsl`
- `llmthink config show --config ./docs/examples/llmthinkrc.sample.json`

出力の `sources` には、各値を最終的に供給したレイヤが入ります。`layer` は `workspace` / `user` / `system` / `env` / `cli` / `default` のいずれかで、`key` は採用された設定キーです。

設定ファイルは JSON です。例:

```json
{
	"thought": {
		"storageDomain": "workspace"
	},
	"embeddings": {
		"provider": "openai",
		"timeoutMs": 5000,
		"openai": {
			"baseUrl": "https://api.openai.com/v1",
			"model": "text-embedding-3-small",
			"apiKey": {
				"env": "OPENAI_API_KEY"
			}
		}
	}
}
```

ひな形は [docs/examples/llmthinkrc.sample.json](docs/examples/llmthinkrc.sample.json) にあります。`.llmthinkrc` として配置するか、`--config` で直接参照できます。

secret は次の形式で指定できます。

- 文字列または `{ "value": "..." }`: 直値
- `{ "env": "OPENAI_API_KEY" }`: 環境変数
- `{ "command": "pass show llmthink/openai" }`: コマンド実行結果
- `{ "secdat": "OPENAI_API_KEY" }` または `{ "secdat": { "key": "OPENAI_API_KEY", "dir": "./secrets" } }`: `secdat` 参照

埋め込みの組み込みプロバイダーは `ollama`、`openai`、`none` です。設定ファイルがない場合は従来どおり環境変数も使えます。

- `LLMTHINK_EMBEDDING_PROVIDER`: `ollama` | `openai` | `none`
- `LLMTHINK_EMBEDDING_TIMEOUT_MS`: 埋め込み API のタイムアウトミリ秒。既定は `3000`
- `OLLAMA_BASE_URL`: Ollama API のベース URL。既定は `http://127.0.0.1:11434`
- `OLLAMA_EMBED_MODEL`: Ollama の埋め込みモデル名。既定は `nomic-embed-text`
- `OPENAI_BASE_URL`: OpenAI 互換 embeddings API のベース URL。既定は `https://api.openai.com/v1`
- `OPENAI_API_KEY`: OpenAI 互換 embeddings API の認証キー
- `OPENAI_EMBED_MODEL`: OpenAI 互換 embeddings API のモデル名。既定は `text-embedding-3-small`

例:

- `npm run cli -- thought list --storage-domain user`
- `npm run cli -- dsl audit docs/examples/query-assist.dsl --config ./.llmthinkrc --pretty`
- `LLMTHINK_EMBEDDING_PROVIDER=openai OPENAI_API_KEY=... npm run cli -- dsl audit docs/examples/query-assist.dsl --pretty`
- `LLMTHINK_EMBEDDING_PROVIDER=none npm run verify-examples`

## Query 埋め込みの扱い

- `.problems[] | select(.id == "P1") | related_decisions` のような query は、式そのものに加えて参照先 problem の本文も埋め込み対象に含める
- これにより、固定的な query 関数名だけではなく、選択された problem 文脈に近い decision が上位に来やすくなる

## DSL ヘルプ

- CLI では `llmthink dsl help` で全体文法を表示する
- sample は固定 path ではなく sample id で案内し、`llmthink dsl help samples <sample-id> detail` で現在環境の resolved path を確認できる
- MCP では `dsl action=help`、VSIX tool では `action=help` を使う
- `decision based_on` は declared problem id と statement id を参照できる
- 文法エラー時は、関連する理由、期待される構文、その場で呼べる help 導線を fatal report に含める

## Versioning

- release version の判断基準は docs/process/version-bump-rules.dsl を正とする
- root package、MCP server、VSIX extension は同じ release version を共有する
- main へ入る公開差分ごとに version を bump する
- 0.4.0 は preview HTML CLI、Playwright 回帰テスト、sample registry、DSL help 導線整理、VSIX preview UX 改善をまとめた minor release とする
- 0.4.1 は MPL-2.0 への切替、`based_on` 文言明確化、preview の problem node 表示と配色調整をまとめた patch release とする
- 0.4.2 は VS Code 拡張の thought 永続化先を workspace / extension storage 起点へ修正し、Windows + WSL Remote での EACCES を解消する patch release とする
- 0.4.3 は annotation / comparison の help 導線強化、LSP completion の文脈依存化、grammar spec 同期をまとめた patch release とする

## ライセンス

- 本リポジトリは MPL-2.0 で提供する
- 依存ライブラリはそれぞれのライセンス条件に従う
- MPL-2.0 の全文は LICENSE を参照する
