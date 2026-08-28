# ADR-0019: Hosted serverをworkspace境界へ抽出してlive contractを結合する

## Status

accepted

## Date

2026-08-28

## Partial Supersession

[ADR-0020](0020-root-package-excludes-hosted-server.md)は、root compatibility facadeを残す判断と未解決のserver distribution方式を置き換える。private server workspace、live contract binding、残存WIPの段階移管は本ADRを引き続き正とする。

## Decision Owner

llmthink decision owner

## Context

- Issue #29はHosted MCP、REST、OAuth、lifecycle、SQLite、backup、archiveを`llmthink-server`境界へ分離する方針を固定している
- ADR-0017でCoreは独立workspaceになり、ADR-0018でHosted MCP v1 contractとsource-independent Conformance Kitが抽出された
- current mainのserver実装とserver testはroot `src/server`、`test/server`に残り、root package変更と同じbuild/test境界にある
- canonical Hosted MCP v1はonboardingを1 tool、admitted surfaceを10 toolとして固定するが、current main実装はonboarding/deleteを持たない
- retained WIP `c205a7d`はcanonical surfaceを実装する一方、OAuth、trial、backup、deployment evidenceを含む多数の未統合変更も保持する
- WIP全体のmerge、外部repository作成、package publication、deployment、Production activationは今回のauthorityに含まれない
- 2026-08-28にdecision ownerは、Issue #29の次段階としてserver分離とlive producer bindingを進めるよう確認した

## Decision

同一repository内にprivate workspace `@llmthink/server@1.0.0`を作り、Hosted server sourceとserver専用testの後継境界とする。

- server workspaceは`@llmthink/core@1.3.0`と`@llmthink/contracts@1.0.0`へ正確versionで依存する
- server sourceはroot application、local thought store、stdio MCP、LSP、plugin、VS Code implementationをimportしない
- hosted thought lifecycleに必要なsnapshot、event、reflection型はserver contractが所有し、root local store型をauthorityにしない
- current root server実装はworkspaceへ移し、初期抽出ではrootに既存binとpublic exportを保つ薄いcompatibility facadeだけを残す。このfacadeはADR-0020で後に削除する
- retained WIPから今回forward-portする機能は、canonical contractのlive producerに必要なtenant/revision-bound deleteとMCP onboarding bridgeに限定する
- implementation-owned tool registryからproducer surfaceを生成し、canonical artifact SHA-256 `774fb22a3ce4d6225cef7c791dc006414cf2795c54de308d08db17ed0245343d`のsurfaceとConformance Kitで照合する
- server path、contract path、正確dependency pathの変更時だけfocused server CIを起動する
- OAuth account registry、browser onboarding handler、SQLite lifecycle、backup/archive/restore、deployment operationsは後続のbounded migrationとする
- external `llmthink-server` repositoryのvisibility、作成、release ownershipは、workspace境界が検証された後に別途決定する

## Alternatives Considered

- retained WIPをcurrent mainへ直接mergeする
  - Core workspace後のmainと大きく分岐し、server codeとdeployment/terms/backup evidenceを混在させるため不採用
- current mainの9-tool serverだけをworkspaceへ移す
  - canonical contractをlive producerへ接続できず、ADR-0018のpending actionを残すため不採用
- OAuth、SQLite、backupを同じPRですべてforward-portする
  - migration単位が大きくなり、security、storage、operationsの受入証拠を個別に検査できないため不採用
- 直ちにexternal repositoryを作成する
  - visibility、release ownership、移管manifestが未確定な状態で新しいauthorityを作るため不採用
- root server sourceを複製したままworkspaceを追加する
  - 二つのimplementation authorityが生じ、contract driftを作るため不採用

## Consequences

Good:

- server変更は55件以上のfocused testとserver typecheckで検証でき、Core/plugin/VSIXの全検査を通常要求しない
- 初期抽出時点のroot public surfaceとlocal CLI/stdio MCPを維持しながらserver source ownershipを分離できる。root Hosted surfaceはADR-0020で後に削除する
- onboarding/deleteを含むcanonical 11-tool surfaceがfixtureではなくimplementation registryへ結合される
- WIPの残りをOAuth、SQLite、backup/operations単位でforward-portできる

Bad / Risk:

- private workspace期間に残ったroot dependency/publication constraintはADR-0020でservice-only境界として解消した
- root compatibility facadeはADR-0020で削除した
- server-local thought型とroot local thought型は構造が似るため、意味境界を文書とtestで維持する必要がある
- onboarding bridgeはfull browser/account lifecycleを含まず、後続migrationなしではtrial onboarding全体を提供しない

Neutral:

- canonical surface artifactのsource revisionはretained WIP provenanceを維持し、新package commitのidentityとは分けて扱う
- repository split自体はservice admission、deployment、release、Production状態を変更しない

## Implementation Notes

- workspace: `packages/server/`
- removed root compatibility facade: `src/server/hosted-main.ts` and Hosted exports in `src/index.ts` (ADR-0020)
- implementation surface registry: `packages/server/src/hosted-mcp-surface.ts`
- focused tests: `packages/server/test/`
- repository boundary test: `test/contracts/server-package-boundary.test.ts`
- path-limited CI: `.github/workflows/server.yml`
- task issue: [#35](https://github.com/mako10k/llmthink/issues/35)

## Review

- Ownership review: server sourceにroot application implementation importがないことを検査する
- Contract review: implementation registry、runtime tools、canonical surfaceのtool/effect/required集合を比較する
- Security review: onboarding identityを既存tenantへ昇格させず、deleteがtenant、scope、revision、idempotencyで拘束されることを検査する
- Compatibility review: root packageがHosted export/bin/dependencyを含まず、local CLI/stdio MCPがserver loopbackを要求しないことを検査する
- Authority review: external repository、publish、release、deployment、Production、WIP削除を実行していないことを確認する

## Traceability

- Claim `C-SERVER-001`: server source/testはroot applicationのrelease/test境界から分離しなければならない
  - Evidence `E-SERVER-001`: current mainは`src/server`と`test/server`をroot TypeScript/test globで所有していた
  - Evidence `E-SERVER-002`: Issue #29はHosted serverに異なるrelease cadence、authority、focused testを要求する
- Claim `C-SERVER-002`: canonical contractはimplementation-owned surfaceへ接続しなければならない
  - Evidence `E-SERVER-003`: ADR-0018のfixtureはWIP surfaceを保持するがcurrent mainはonboarding/deleteを実装しない
  - Evidence `E-SERVER-004`: retained WIP `df8e683..c205a7d`はpluginが検証したonboarding/delete surfaceを保持する
- Claim `C-SERVER-003`: WIPのoperations変更をserver code移動へ暗黙に混ぜてはならない
  - Evidence `E-SERVER-005`: integration ledgerはWIP 66 commitsをserver、server operations、plugin、core、historyへ分類している
- Action `A-SERVER-001` (`C-SERVER-001`): private server workspace、root facade、focused test/CIを追加する
  - Status: implemented by Issue #35
- Action `A-SERVER-002` (`C-SERVER-002`): onboarding/deleteとimplementation surface registryをforward-portしてConformance Kitへ接続する
  - Status: implemented by Issue #35
- Action `A-SERVER-003` (`C-SERVER-003`): OAuth、SQLite、backup/operationsを個別migrationへ残す
  - Status: pending under Issue #29

## Follow-ups

- managed OAuth、browser onboarding、account registryをserver workspaceへforward-portする
- SQLite lifecycle control planeとaccepted Node SQLite driver decisionをfocused migrationで再現する
- backup/archive/restore codeとoperations evidenceを分けて移管する
- external repository作成前にvisibility、release owner、package distribution、Issue/PERT successor manifestを確認する
- root compatibility facadeとprivate workspace publication constraintはADR-0020で解消済み。external splitは別判断として残る

## Auditability Notes

- server sourceがroot `src/` implementationへ相対importした場合はownership boundary違反とする
- runtime tool集合とimplementation surface registryがずれた場合はlive contract binding違反とする
- canonical contractとsurfaceがずれたままpackage version/hashを維持した場合はcompatibility violationとする
- workspace extractionを根拠にdeployment、Production、release、WIP削除を完了扱いにしてはならない
