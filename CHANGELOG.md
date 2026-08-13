# Changelog

## Unreleased

## 1.1.0 - 2026-08-13

- evidence に匿名の resource block を 0..N 個追加し、URL / file / blob locator、sha256 digest、MIME type、label を I/O なしで構造検証する
- evidence resource を formatter、DSLQL projection、Help/LSP、TextMate、preview、examples、VSIX と配布生成物へ同期する
- resource を宣言 ID、`based_on`、semantic operand へ昇格させず、外部取得と content verification を将来の明示的 resolver capability へ分離する

## 1.0.0 - 2026-08-13

- DSLQL を range 付き公開 AST、visitor / transformer / formatter、AST 直接評価を持つ v2 core へ再構成
- 宣言参照を `@ID`、関数呼出しを `name()` と明示し、required / optional path と strict cardinality を分離
- document runtime を source AST の一意な正規形へ改め、relation 関数を入力依存の graph traversal として実装
- semantic 演算を `similarity(left, right)`、`similar_to(left, right, threshold)`、`nearest_to(target[, threshold])` に分離した
- embedding を一級オブジェクトの不可視属性として定義し、文字列リテラルだけを安全な遅延生成対象に限定した。動的な path / `concat(...)` は生成上限を証明できる optimizer の導入まで拒否する
- embedding 無効・失敗時は semantic query を暗黙 fallback せず、Analyzer が空の query result と info 診断を返すようにした
- DSLQL v2 の破壊的変更に合わせ、root package、MCP server、VSIX extension を 1.0.0 へ同期
- framework / domain / problem / step / statement / query を一つの宣言 ID namespace に統合し、cross-kind 重複を parse 時に拒否
- `validateDslqlAst` を公開し、全 public AST 境界で finite number、safe index、range、category、operator、重複 field、cycle を fail closed に検査
- embedded query result を decision-only `items` から順序付き `DslqlValue` の `values` へ変更し、query expression embedding、固定 score、暗黙再順位付けを廃止。presentation truncation は `total_value_count` / `truncated` で明示
- 20 個の組み込み関数を `DSLQL_FUNCTION_SPECS` に集約し、evaluator、Help/MCP、LSP、VSIX の被覆検査を追加

## 0.5.2

- 監査出力へ最低 severity と category 抑制を追加し、ノイズ除外後の件数に対して出力上限を適用
- CLI の `--min-severity` / `--suppress-category` / `--suppress-tag` と MCP の対応する監査出力オプションを追加
- 100 件を超える監査ノイズがあっても、フィルタ後の出力が上限内なら成功する回帰テストを追加
- preview 回帰テストのリポジトリ path 依存と DSLQL 行番 fixture の差異を修正
- VSIX 用の standalone extension bundle を現行の LSP 解決順に同期
- root package の public publish 設定と npm インストール導線を追加

## 0.5.1

- VSIX 同梱の bundled LSP で shebang が二重化して起動時に SyntaxError になる不具合を修正
- block text highlight の scope 維持と dedent 復帰修正を含む 0.5.0 系の VSIX を patch release として再パッケージ

## 0.5.0

- DSL の text-bearing field に multiline block text を導入し、parser、formatter、help/spec、VSIX preview を対応
- block text / long quoted text 向けの lint と修正導線を追加し、sample DSL 群を新ルールへ追従
- VSIX の syntax highlight を block text の文脈復帰と scope 維持に対応させ、dedent 後の復帰と本文内キーワード漏れを修正

## 0.4.3

- annotation kind 向けの専用 syntax help と parse error 導線を追加し、未知の kind で文法説明へ辿りやすく改善
- LSP completion を annotation kind と comparison relation の文脈依存候補に対応し、関連 keyword docs を補強
- DSL grammar spec を現行実装に同期し、comparison annotation と annotation kind / owner 一覧の記述漏れを修正

## 0.4.2

- VS Code 拡張の thought 永続化で保存基底ディレクトリをワークスペースまたは extension storage から解決するようにし、Windows + WSL Remote で `process.cwd()` 由来の EACCES を回避

## 0.4.1

- root package、MCP server、VSIX extension のライセンス表記を MPL-2.0 へ切り替え、LICENSE と README 群を更新
- `decision based_on` が declared problem id と statement id の両方を参照できることを audit/help/spec に明記
- preview graph の problem node を premise と見分けやすい暖色系へ調整

## 0.4.0

- sample registry を追加し、DSL help と example verification を配布形態に依存しない解決へ統一
- DSL help に samples 導線と sample detail 表示を追加
- root package、MCP server、VSIX extension の version を 1 つの release version に同期
- preview HTML を CLI から出力できるようにし、ブラウザ単体で再現と検証を可能にした
- Playwright による preview HTML の回帰テストを追加し、zoom 時の外側レイアウト drift を再発防止
- VSIX preview を fit 起点の単純な構造へ整理し、minimap と control overlay を簡素化
- release 運用のための version bump rule と release checklist を整備
