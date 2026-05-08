framework LicenseModelReview:
  requires problem and decision
  requires evidence or premise
  warns pending

domain PublicRepositoryLicense:
  description "llmthink を public repository として公開するにあたり、変な横取りや独自囲い込みを抑止しつつ、CLI/MCP/VSIX の配布と依存ライブラリ整合性を保てるライセンスを決める"

problem P1:
  "現状の LICENSE は proprietary / all rights reserved であり、public repository として公開しても第三者がどこまで利用、改変、再配布できるかが不明瞭である"

problem P2:
  "利用者の意図は permissive な全面許可ではなく、横取りや独自派生の囲い込みを抑止したいことであり、copyleft の強さを適切に選ぶ必要がある"

problem P3:
  "このリポジトリは CLI、MCP server、LSP、VSIX extension を同時に配布しており、強すぎる copyleft は VSIX 導入や企業内利用の障壁になりうる"

problem P4:
  "選ぶライセンスは direct dependency の Apache-2.0、EPL-2.0、MIT、ISC、BSD と整合し、再配布時に不用意な衝突を起こしにくい必要がある"

step S1:
  premise PR1:
    "利用者の主目的が source contribution の完全自由化ではなく、改変した本体コードを閉じたまま横取りされにくくすることなら、全面的な strong copyleft より file-level copyleft のほうが意図に近い"

step S2:
  premise PR2:
    "VSIX と CLI の導入障壁は低いほどよく、ライセンスが過剰に伝播すると導入検討時の法務負荷が上がる"

step S2A:
  premise PR3:
    "横取り抑止の主対象が既存本体ファイルの改変再配布であるなら、file-level copyleft で要件を満たせる"

step S2B:
  premise PR4:
    "ライセンス採用後は配布導線の文書も同じ判断に合わせて更新しないと、利用条件の解釈が再び曖昧になる"

step S3:
  evidence EV1:
    "root package の direct dependency は @modelcontextprotocol/sdk、vscode-languageserver、vscode-languageserver-textdocument、zod など MIT 中心で、TypeScript と Playwright は Apache-2.0 である"

step S4:
  evidence EV2:
    "VSIX extension の direct dependency には elkjs の EPL-2.0 があり、他は MIT または Apache-2.0 が中心である"

step S5:
  evidence EV3:
    "GPL を選ぶなら Apache-2.0 との整合性のため GPL-3.0 系に寄せる必要があり、GPL-2.0-only は候補から外れる"

step S6:
  evidence EV4:
    "MPL-2.0 は file-level copyleft であり、既存ファイルを改変して再配布する場合には当該ファイルの公開を求めつつ、独立した周辺コード全体までは巻き込みにくい"

step S7:
  evidence EV5:
    "AGPL-3.0 は network use まで強く要求するため、このリポジトリの現段階では意図より強すぎ、MCP や将来のサービス連携で採用障壁が高い"

step S8:
  decision D1 based_on PR1, PR2, PR3, EV1, EV2, EV4:
    "llmthink の公開ライセンスは MPL-2.0 を第一候補として採用する"

step S9:
  decision D2 based_on P4, EV3:
    "GPL 系は代替候補として GPL-3.0-only までに留め、GPL-2.0-only は依存整合性と将来運用の観点から採用しない"

step S10:
  decision D3 based_on PR3, EV4:
    "MPL-2.0 採用時は、repo 全体を MPL-2.0 で公開しつつ、第三者が既存ソースファイルを改変して再配布する場合には当該変更ファイルを開示する前提で運用する"

step S11:
  decision D4 based_on PR4:
    "README と VSIX README には public repository であっても MPL-2.0 が適用されること、依存ライブラリは各自のライセンスに従うことを明記する"

step S12:
  pending PD1:
    "将来 npm package publish や VS Code Marketplace publish を始める場合、NOTICE や source offer の補足が必要かを再確認する"

step S13:
  pending PD2:
    "docs/examples や generated artifact に第三者著作物が入る場合は、その配布条件を別途点検する"