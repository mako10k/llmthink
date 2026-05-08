# Changelog

## 0.4.0

- sample registry を追加し、DSL help と example verification を配布形態に依存しない解決へ統一
- DSL help に samples 導線と sample detail 表示を追加
- root package、MCP server、VSIX extension の version を 1 つの release version に同期
- preview HTML を CLI から出力できるようにし、ブラウザ単体で再現と検証を可能にした
- Playwright による preview HTML の回帰テストを追加し、zoom 時の外側レイアウト drift を再発防止
- VSIX preview を fit 起点の単純な構造へ整理し、minimap と control overlay を簡素化
- release 運用のための version bump rule と release checklist を整備