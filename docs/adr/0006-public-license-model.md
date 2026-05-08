# ADR-0006: Public repository のライセンスは MPL-2.0 を採用する

## Status

proposed

## Date

2026-05-08

## Context

- 現在の [LICENSE](../../LICENSE) は proprietary / all rights reserved であり、public repository としては利用条件が厳しすぎる
- このリポジトリは CLI、MCP server、LSP、VSIX extension を同時に配布しており、利用者にとって導入のしやすさも重要である
- 一方で、意図は permissive に何でも許すことではなく、改変した本体コードを閉じたまま横取りされにくくしたいことである
- direct dependency は MIT、ISC、BSD が中心で、Apache-2.0 と EPL-2.0 も含む
- GPL を選ぶなら Apache-2.0 と整合する GPL-3.0 系が必要であり、GPL-2.0-only は適さない

## Decision

llmthink の公開ライセンスは MPL-2.0 を採用する。

採用方針は次のとおりとする。

- repo 全体の既存ソースファイルには MPL-2.0 を適用する
- 第三者が MPL 対象ファイルを改変して再配布する場合、当該ファイルの変更は MPL-2.0 に従って開示される前提とする
- CLI、MCP、LSP、VSIX を含む配布は許可するが、依存ライブラリはそれぞれのライセンス条件に従う
- README と VSIX README には MPL-2.0 適用と依存ライセンスが別管理であることを明記する
- GPL 系は代替候補として GPL-3.0-only までに留め、GPL-2.0-only は採用しない

## Alternatives Considered

- GPL-3.0-only
  - strong copyleft として横取り抑止は強いが、VSIX 導入や企業内利用で法務上の心理的障壁が上がりやすいため不採用
- AGPL-3.0-only
  - network use まで強く要求できるが、現段階の配布形態に対して過剰であり、将来の連携面でも重いため不採用
- MIT / Apache-2.0
  - 利用障壁は低いが、改変して閉じたまま再配布されることを抑止できないため不採用
- 現状維持の proprietary / all rights reserved
  - public repository としての利用条件が不明瞭で、外部利用と貢献を過度に阻害するため不採用

## Consequences

- public repository としての利用条件が明確になる
- 本体ファイルの改変再配布には file-level copyleft が働く
- GPL より導入障壁を抑えつつ、完全 permissive よりは横取りを抑止できる
- 将来 Marketplace や npm publish を始める場合、追加の表記や運用確認が必要になる可能性がある

## Auditability Notes

- 依存ライセンス構成が大きく変わった場合は再評価する
- SaaS 提供や hosted MCP のような network distribution が主要ユースケースになった場合は AGPL を含めて再評価する
- 商用デュアルライセンスを検討する場合は MPL-2.0 のまま続けるか別契約を併用するかを再評価する