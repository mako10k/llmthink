# ADR-0017: Coreを独立workspaceとテスト境界にする

## Status

accepted

## Date

2026-08-27

## Partial Supersession

[ADR-0020](0020-root-package-excludes-hosted-server.md)は、root applicationがHosted serverを所有する記述を置き換える。Core workspace、public entrypoint、Core/root test境界に関する判断は本ADRを引き続き正とする。

## Decision Owner

llmthink decision owner

## Context

- ADR-0004はCLI、MCP、VSIXが共通監査APIを利用する方針を採用している
- 従来はCore、server、LSP、thought store、plugin、VSIXがroot packageの同じsource/test treeにあり、Core内部変更と全成果物の回帰検査を分けられなかった
- pluginやVSIXの契約検査にはCoreの公開surfaceが必要だが、Core単体検査にHosted server、SQLite、OAuth、plugin、VSIX実装は不要である
- repositoryを直ちに複数へ分けると、未確定の配布・version・契約運用まで同時に固定することになる
- decision ownerはIssue #29の方針に基づき、最初の段階としてCore変更が全テストへ波及しないレベルの分割を実装するよう確認した

## Decision

Coreを同一repository内の独立npm workspace `@llmthink/core` として分離する。

- `packages/core`はDSL、parser、model、analyzer、DSLQL、audit report presentationを所有する
- v1 API互換性のため、runtime configとembedding adapterはこの段階ではCoreに残す
- root applicationはLSP、thought persistence、CLI/local MCP adapter、plugin/VSIX integrationを所有する。Hosted server ownershipはADR-0020でprivate service workspaceへ移す
- root applicationからCore実装への参照は`@llmthink/core`の公開entrypointだけを通す
- root `llmthink` packageは検証済みCoreの正確versionに依存し、workspace内でもversion一致を契約検査する
- Core sourceからroot applicationまたはadapter implementationへのimportを禁止する
- Core内部変更は`test:core`と`typecheck:core`だけで検証できる
- Coreの公開export、package version、DSLQL registryなど下流surfaceを変更した場合だけ`test:contract`を追加実行する
- root application全体は`test:app`、release/nightly相当の全体回帰は`test:all`として明示的に実行する

この段階ではrepository自体は分割しない。workspace境界とテスト境界を先に安定させ、別repositoryへの移動は後続判断とする。

## Alternatives Considered

- source配置を変えず`test:core` scriptだけ追加する
  - テスト時間は分けられるが、server/LSPからCore内部相対pathを参照でき、将来のrepository分離可能性を検証できないため不採用
- Coreを直ちに別repositoryへ移す
  - 最終的な隔離は強いが、package公開順、version ownership、cross-repository CI、未完了Issueの移管を同時に決める必要があるため現段階では不採用
- parser、model、analyzer、DSLQLを個別packageに分ける
  - 同時変更が多い意味規則へ過剰な契約面を増やし、変更コストが上がるため不採用
- 同一repositoryの独立workspaceへ分け、公開entrypointとテスト契約を先に固定する
  - 依存方向とblast radiusを検証しながら、repository分割を段階的に進められるため採用

## Consequences

Good:

- Core内部変更でHosted server、LSP、plugin、VSIXの全テストを毎回実行する必要がなくなる
- adapterがCore内部pathへ依存できず、公開contractの不足をtypecheckとcontract testで検出できる
- Core packageを将来別repositoryへ移す際のsource/test単位が明確になる
- 全体回帰を削除せず、明示的な`test:all` gateとして維持できる

Bad / Risk:

- root packageとCore packageのversionを同時に管理し、Coreを先にpublishするrelease順序が必要になる
- root applicationのtypecheckとtestは事前にCore buildを必要とする
- runtime configとembedding adapterがCoreに残るため、純粋なI/O-free library境界にはまだなっていない
- 同一repository内では権限とrelease historyはまだ分離されない

Neutral:

- 既存の`llmthink` public entrypointはCore exportをre-exportし、利用者向けAPI互換性を維持する
- server、plugin、VSIXのrepository分割はIssue #29の後続段階として残る

## Implementation Notes

- Core package: `packages/core/package.json`
- Core public API: `packages/core/src/index.ts`
- Core tests: `packages/core/test/`
- root compatibility facade: `src/index.ts`
- dependency direction guard: `test/contracts/core-package-boundary.test.ts`
- DSLQL/help/VSIX surface guard: `test/contracts/dslql-surface-compat.test.ts`
- test commands and ownership: `docs/process/core-package-boundary.md`

## Review

- Specialist review: TypeScript package resolution、npm workspace version、relative import escape、root facade、test ownershipを検査する
- Non-specialist review: Coreの変更時はCore検査だけ、公開契約変更時は下流契約検査、release時は全体検査という3段階で説明できる
- Root-chain review: ADR-0004の共通監査APIを維持しつつ、その実装をroot applicationから独立したpackage boundaryへ移す

## Traceability

- Claim `C-CORE-BOUNDARY-001`: Core内部変更はadapter成果物の全回帰検査を必須にしてはならない
  - Evidence `E-CORE-BOUNDARY-001`: 従来のroot `test/**/*.test.ts`はCore、server、LSP、plugin、VSIXテストを一括実行していた
  - Evidence `E-CORE-BOUNDARY-002`: `packages/core/package.json`はCore sourceとCore testだけをbuild/test対象にする
- Claim `C-CORE-BOUNDARY-002`: 下流はCore内部pathでなくversioned public contractへ依存しなければならない
  - Evidence `E-CORE-BOUNDARY-003`: root sourceは`@llmthink/core`からimportする
  - Evidence `E-CORE-BOUNDARY-004`: boundary testはCoreからのescape importとrootの旧Core directoryを拒否する
- Claim `C-CORE-BOUNDARY-003`: 分離後も全体互換性検査を失ってはならない
  - Evidence `E-CORE-BOUNDARY-005`: `test:contract`が公開surfaceとroot typecheckを検査する
  - Evidence `E-CORE-BOUNDARY-006`: `test:all`がCore testとroot application testを明示的に結合する
- Action `A-CORE-BOUNDARY-001` (`C-CORE-BOUNDARY-001`, `C-CORE-BOUNDARY-002`): Core source/testを独立workspaceへ移す
  - Status: completed by this change
- Action `A-CORE-BOUNDARY-002` (`C-CORE-BOUNDARY-002`, `C-CORE-BOUNDARY-003`): exact version pinとcontract gateを追加する
  - Status: completed by this change
- Action `A-CORE-BOUNDARY-003` (`C-CORE-BOUNDARY-003`): release checklistをCore先行build/publishと`test:all`へ同期する
  - Status: completed by this change

## Follow-ups

- plugin、server、VS Code extensionのrepository分割はIssue #29で段階的に扱う
- runtime config/embedding adapterをCoreから分けるのは、I/O-free Coreを必要とする具体的な利用者が現れた場合に別ADRで判断する
- cross-repository CIは最初のrepository分割時にcontract version/hashと合わせて定義する

## Auditability Notes

- Core sourceが`src/server`、`src/lsp`、`src/thought`、plugin、vscode-extensionをimportした場合は本ADR違反として扱う
- Core内部変更で常に`test:all`を要求する運用へ戻る場合は、失敗実績と必要な契約範囲を示して再判断する
- public exportまたはCore version変更を`test:contract`なしで受け入れてはならない
- 別repositoryへ移動する際は、Issue・PERT・release obligationの後継ownerを確定してからsourceを削除する
