# llmthink

思考記述 DSL と思考監査エンジンの設計ドキュメントを管理するリポジトリ。

LLMThink 文書の標準拡張子は `.think`。既存の `.dsl` は同じ文法・language ID の互換 alias として、警告や暗黙 rename なしで引き続き利用できる。

現行 release version は [1.3.0](https://github.com/mako10k/llmthink/releases/tag/v1.3.0)。

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
- docs/adr/0015-rational-confidence-interval-propagation.md
- docs/specs/ui-architecture.md
- docs/specs/dslql.md
- docs/examples/dsl-samples.md
- docs/examples/confidence-propagation.think
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
- npm run cli -- dsl audit docs/examples/contradiction-pending.think
- npm run cli -- dsl audit docs/examples/contradiction-pending.think --pretty
- npm run cli -- dsl help
- npm run cli -- dsl help samples query-assist detail
- npm run preview:html -- docs/examples/contradiction-pending.think --out /tmp/llmthink-preview.html
- npm run verify-examples
- npm run mcp
- npm run typecheck:extension
- npm run build:extension
- npm run package:vsix

## 配布

- npm package の現行公開版は [llmthink@1.3.0](https://www.npmjs.com/package/llmthink/v/1.3.0)
- npm package は `npm install -g llmthink@1.3.0` で CLI / MCP / LSP をインストールできる
- library として利用する場合は `npm install llmthink` を使う
- VS Code 拡張の現行配布物は [GitHub Release v1.3.0](https://github.com/mako10k/llmthink/releases/tag/v1.3.0) の `llmthink.vsix`
- ローカルで VS Code 拡張を生成する場合は vscode-extension/llmthink.vsix を使う
- 生成コマンドは npm run package:vsix
- release 手順、検査項目、tag 付与順は docs/process/release-checklist.md を正とする
- 変更内容の公開履歴は CHANGELOG.md を正とする

## Thought CLI

CLI は resource-first に `dsl` と `thought` の 2 系統へ寄せる。

- `llmthink dsl audit ...`: 自動登録込みの DSL 監査。thought-id を返す。`--min-severity` と `--suppress-category` で表示だけを絞り込める
- `llmthink dsl help`: DSL 全体文法の表示
- `llmthink thought draft --id <thought-id> [<file> | --text "...dsl..."] [--from source-thought-id]`: draft の作成・更新
- `llmthink thought relate --id <thought-id> --from source-thought-id`: 既存 thought から関連 thought を作成
- `llmthink thought audit --id <thought-id> [<file> | --text "...dsl..."] [--pretty]`: current draft を監査し、監査結果を保存。出力フィルタは `dsl audit` と共通
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

### 監査出力の絞り込み

大量の `info` / `hint` が件数上限を占有する場合は、監査原本を保持したまま表示だけを絞り込める。

```bash
# fatal / error / warning だけを表示
llmthink dsl audit input.think --pretty --min-severity warning

# semantic_hint と query_result を表示しない
llmthink dsl audit input.think --suppress-category semantic_hint,query_result
```

- `--min-severity fatal|error|warning|info|hint`: 指定値以上の severity を表示する
- `--suppress-category <category[,category...]>`: 指定 category を表示しない。複数回指定も可能
- `--suppress-tag` は `--suppress-category` の別名
- フィルタは `--limit` より先に適用する。フィルタ後の件数が上限以下なら `output_limit` は生成しない
- 保存される `audits/*.json` は常に未フィルタの監査原本であり、再表示時に別のフィルタを選べる

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
			draft.think
			final.think
			semantic-audit.think
			audits/
				<timestamp>.json
```

- `thought.json`: 現在状態、latest audit、draft/final の参照
- `history.json`: draft 保存、監査保存、finalize などの履歴
- `draft.think`: 現在の思考ドラフト
- `final.think`: 最終保存された思考
- `semantic-audit.think`: semantic audit の記録
- `audits/*.json`: 各監査レポートのスナップショット
- 既存 record が `draft.dsl` / `final.dsl` / `semantic-audit.dsl` を指す場合は、そのファイルを rename せず読み書きする

### シナリオ

自動登録付き監査 -> 修正 -> 再監査 -> 最終保存:

```bash
llmthink dsl audit docs/examples/query-assist.think --pretty
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
- MCP の `dsl action=audit` と `thought action=audit|show` では、`minSeverity`、`suppressCategories`、`maxIssues` を監査出力へ指定できる
- VS Code の Problems 診断は `llmthink.diagnostics.minimumSeverity` と `llmthink.diagnostics.suppressedCategories` で絞り込める
- `llmthink.diagnostics.categorySeverityOverrides` では補助カテゴリ `semantic_hint` / `contradiction_candidate` を `error|warning|info|hint|off` へ明示的に変更できる。既定値は監査結果の severity を維持する
- LSPはquery、statement role、annotation、comparison、resource、confidenceを文脈別に補完する。参照説明は常時inlayではなくon-demand hoverを使う

## 埋め込み設定

- 既定の埋め込みプロバイダは Ollama
- 埋め込み取得に失敗した場合、decision 間の補助 `semantic_hint` だけは従来のヒューリスティック表示を維持する。DSLQL query result は暗黙の embedding、固定 score、再順位付けを行わない
- `similarity()`、`similar_to()`、`nearest_to()` を明示した DSLQL query は意味を変える fallback を行わず、実行不能として報告する

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
- `npm run cli -- dsl audit docs/examples/query-assist.think --pretty`

## Runtime Config

設定ファイルの読み込み順は次のとおりです。

1. ワークスペース: カレントディレクトリまたは対象ファイルから親方向に探索した `.llmthinkrc`
2. ユーザ: `XDG_CONFIG_HOME/llmthink/config.json`、なければ `~/.llmthinkrc`
3. システム: `/etc/llmthinkrc`

thought の保存先も同じ優先順で決まります。既定値は次のとおりです。

- workspace: `XDG_STATE_HOME/llmthink/workspace/<workspace-id>`。`<workspace-id>` は、カレントディレクトリまたは対象ファイルから親方向に探索して見つかった有効なワークスペース root（`.git/`、`package.json`、`tsconfig.json` など）から導出されます。見つからない場合は実行ディレクトリ系の解決結果を使います。
- user: `XDG_STATE_HOME/llmthink/user`、なければ `~/.local/state/llmthink/user`
- system: `/var/lib/llmthink/system`

CLI では保存先を直接上書きできます。

- `--config path/to/.llmthinkrc`
- `--storage-domain workspace|user|system`
- `--storage-path path/to/storage-root`

現在どの設定が解決されているかは `llmthink config show` で確認できます。対象ファイルを付けると、そのファイル基準のワークスペース探索結果を表示します。

- `llmthink config show`
- `llmthink config show docs/examples/query-assist.think`
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

- `LLMTHINK_STORAGE_DOMAIN`: `workspace` | `user` | `system`
- `LLMTHINK_STORAGE_PATH`: thought storage root の絶対 path または実行ディレクトリ基準の相対 path
- `LLMTHINK_EMBEDDING_PROVIDER`: `ollama` | `openai` | `none`
- `LLMTHINK_EMBEDDING_TIMEOUT_MS`: 埋め込み API のタイムアウトミリ秒。既定は `3000`
- `OLLAMA_BASE_URL`: Ollama API のベース URL。既定は `http://127.0.0.1:11434`
- `OLLAMA_EMBED_MODEL`: Ollama の埋め込みモデル名。既定は `nomic-embed-text`
- `OPENAI_BASE_URL`: OpenAI 互換 embeddings API のベース URL。既定は `https://api.openai.com/v1`
- `OPENAI_API_KEY`: OpenAI 互換 embeddings API の認証キー
- `OPENAI_EMBED_MODEL`: OpenAI 互換 embeddings API のモデル名。既定は `text-embedding-3-small`

例:

- `npm run cli -- thought list --storage-domain user`
- `LLMTHINK_STORAGE_DOMAIN=user npm run cli -- thought list`
- `LLMTHINK_STORAGE_PATH=/srv/llmthink/shared npm run cli -- thought list`
- `npm run cli -- dsl audit docs/examples/query-assist.think --config ./.llmthinkrc --pretty`
- `LLMTHINK_EMBEDDING_PROVIDER=openai OPENAI_API_KEY=... npm run cli -- dsl audit docs/examples/query-assist.think --pretty`
- `LLMTHINK_EMBEDDING_PROVIDER=none npm run verify-examples`

## DSLQL query result と埋め込みの扱い

evidence は必須本文に加えて、出典や取得先を表す匿名 `resource:` block を 0 個以上持てます。

```dsl
evidence EV1:
  "公開仕様が設計判断を裏付ける"
  resource:
    url "https://example.test/specification.pdf"
    digest "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    mime "application/pdf"
    label "公開仕様"
```

- locator は `url` / `file` / `blob` のいずれかちょうど 1 つ。`digest` / `mime` / `label` は任意
- 通常の parse / audit は構造だけを検査し、URL fetch、file read、digest verification、MIME sniff を実行しない
- resource は匿名 value で、宣言 ID、`based_on`、`@ID`、semantic operand にはしない
- DSLQL では evidence の `.resources[]` から `locator_kind`、`locator`、`digest`、`mime`、`label`、`span` を取得できる
- named/shared resource、resource-only evidence、sha256 以外の digest、resource の自動取得・抽出・embedding は未導入
- 完全な例は [docs/examples/evidence-resource.think](docs/examples/evidence-resource.think) を参照する

### 信頼度の伝搬

入力端と明示した scoring edge に、有理数の代表値・区間・認識タグを宣言できます。

```dsl
confidence EV1:
  keyword strong_assumption

confidence EV1 -> D1:
  keyword approximate_inference

declared_confidence D1:
  keyword rough_assumption
```

- 内部計算は正確な有理数を使い、`lower <= estimate <= upper` を保持する
- `known | estimated | unknown` は数値と直交する。`unknown` でも区間は失われない
- 未指定 source は `1/2 [1/4..3/4] unknown`、未指定 scoring edge は `19/20 [9/10..1/1] unknown` の `support-trace-v1` profile を使う
- `keyword` は版付き表から区間へ展開する。source では `defined`、`common_fact`、`strong_assumption`、`rough_assumption`、`unsupported_assumption`、`unlikely_assumption`、`likely_refuted`、`refuted`、edge では対応する `exact_transform` から `invalid` までの推論用語彙を使う
- 展開結果には `origin=keyword`、`profile_id`、`keyword_id` が残り、後から数値の由来を確認できる
- scoring edge は `confidence SOURCE -> DECISION:` で明示し、`based_on` だけから暗黙生成しない
- 複数のincoming scoring parentは、成分ごとの`min`を保守的baselineとして返し、信頼度を
  自動上昇させない。`aggregation`には依存関係未解決、上昇未適用、原因nodeとparent数が残り、
  下流resultにも伝搬する
- `declared_confidence`はdecision作者の自己申告値をderived assessmentと別に保持する。自己申告
  estimateがderived interval外ならwarning、区間内ならcomparisonだけを返し、派生値は上書きしない
- cycle、未解決参照、scope 不一致、算術上限は `uncomputable` として局所報告する
- 結果は監査・再読用の派生ビューであり、真偽、severity、finalize、承認の authority ではない
- 完全な例は [docs/examples/confidence-propagation.think](docs/examples/confidence-propagation.think) を参照する

- query block の評価結果は `query_results[].values` に順序どおり格納し、boolean、string、object、semantic match を decision 候補へ暗黙変換しない
- query expression 自体や参照先本文を補助 embedding せず、固定 score、lexical fallback、暗黙再順位付けを行わない。順位が必要な場合だけ `nearest_to()` を式に明示する
- raw report は lossless で、presentation 上限を適用したコピーだけが `total_value_count` と `truncated: true` で省略を明示する
- DSLQL v2 では宣言参照を `@ID`、関数を `name()` と明示し、required path と `.field?` を区別する
- framework、domain、problem、step、statement、query は文書全体で一つの ID namespace を共有し、cross-kind の重複も parse error にする
- `similarity(., @P1)` は数値、`similar_to(., @P1, 0.5)` は真偽値を返す。文字列リテラルは semantic runtime preparation 時に embedding し、同じ準備内で共通化する
- `.document.steps[].statement | select(.role == "decision") | nearest_to(@P1, 0.5)` で候補を embedding 類似度順にできる。結果は `.node`、`.score`、`.provider`、`.model` を持つ
- 動的な文字列 path や `concat(...)` は semantic operand にできない。式全体の embedding 生成上限を証明する optimizer が導入されるまで fail closed とする
- distinct な文字列リテラルの遅延 embedding は `maxOnDemandEmbeddings`（既定8）で制限し、キャッシュ状態に依存せず最悪時の件数で検査する。`auditDslText` / `auditDslFile` からは `semanticMaxOnDemandEmbeddings` で渡す
- semantic query は provider 不可時に全候補や lexical search へ暗黙 fallback せず、実行不能を監査結果へ明示する
- package の主要 API は `parseDslqlExpression`、`validateDslqlAst`、`visitDslqlAst`、`transformDslqlAst`、`formatDslqlExpression`、`collectDslqlReferences`、`evaluateDslqlExpression`、`documentAstToDslqlValue`、`createDocumentDeclarationIndex`、`createDocumentDslqlRuntime`、`DSLQL_FUNCTION_SPECS`、`usesSemanticDslql`、semantic runtime/evaluator 群を公開する
- 完全な構文、stream cardinality、正規化 AST schema は [docs/specs/dslql.md](docs/specs/dslql.md) を参照する

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
- 0.5.0 は multiline block text、long quoted lint と修正導線、block text highlight 修正をまとめた minor release とする
- 0.5.1 は bundled LSP の起動回帰修正を含む patch release とする
- 0.5.2 は後方互換な監査出力フィルタ、配布成果物の同期、npm への初回公開をまとめた patch release とする
- 1.0.0 は DSLQL の構文、公開 AST、評価意味論、document runtime を一貫した v2 契約へ破壊的に再構成する major release とする
- 1.1.0 は evidence resource の匿名 0..N payload、構造検証、DSLQL projection、Help/LSP/preview/VSIX 同期をまとめた minor release とする
- 1.1.1 は 1.1.0 公開文書と VSIX 同梱 README の version 整合、および fail-closed release gate の整備をまとめた patch release とする
- 1.2.0 は `.think` 標準拡張子、`.dsl` 互換 alias、既存 thought store の in-place 互換をまとめた minor release とする
- 1.3.0 は hosted server境界と、信頼度の有理数区間伝搬、版付きキーワード、複数親baseline、自己申告値比較をまとめた minor release とする

## ライセンス

- 本リポジトリは MPL-2.0 で提供する
- 依存ライブラリはそれぞれのライセンス条件に従う
- MPL-2.0 の全文は LICENSE を参照する
