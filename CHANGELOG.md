# Changelog

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