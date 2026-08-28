# ADR-0020: root packageからHosted server runtime surfaceを除外する

## Status

accepted

## Date

2026-08-28

## Decision Owner

llmthink decision owner

## Context

- Issue #29はlocal/core成果物とHosted serviceでrelease cadence、実行権限、運用責任を分ける方針を固定している
- ADR-0019はserver source/testをprivate `@llmthink/server` workspaceへ抽出したが、移行用にroot runtime dependency、public re-export、`llmthink-hosted-mcp` binを残した
- repository内ではnpm workspace linkでprivate dependencyを解決できるが、root tarballだけを取得する利用者は未公開の`@llmthink/server`を解決できない
- root tarballへserverを同梱すると、root releaseとHosted service releaseが再び同じ配布境界へ結合する
- `llmthink@1.3.0`はHosted server exportとbinを公開済みであり、その削除は後方互換ではない
- 2026-08-28にdecision ownerは、Hosted serverをservice-only境界とし、root packageから分離する選択肢を明示的に採用した
- external server repository作成、package publication、deployment、Production activation、releaseは今回のauthorityに含まれない

## Decision

public root package `llmthink`からHosted serverのruntime surfaceを除外する。

- rootはlocal CLI、local stdio MCP、LSP、local thought persistence、`@llmthink/core` compatibility facadeだけを所有する
- root `dependencies`から`@llmthink/server`を削除する
- root public entrypointからHosted Application Service、repository、REST/HTTP MCP、policy/security、producer descriptorのexportを削除する
- rootの`llmthink-hosted-mcp` bin、`src/server/hosted-main.ts` facade、対応する`dist/server`成果物を削除する
- root npm packは`dist/server/**`を明示的に除外し、ignoredな旧build/WIP artifactも配布しない
- root app build、typecheck、test、prepackはserver build/testを要求しない
- `@llmthink/server`は同一repository内のprivate service workspaceとして独立build/testを維持し、Hosted MCP v1 contractのlive producerであり続ける
- Hosted service consumerはroot library APIでなくversioned network contractを利用する
- `test:all`とcontract変更時のdownstream conformanceは、明示的なintegration/release gateとしてserver検査を維持する
- 公開済みroot surfaceの削除は次回root releaseのmajor変更とするが、この実装taskではversion bump、release、publishを行わない
- external server repositoryとservice release ownershipは、残存WIP移管条件を満たした後の別判断とする

## Alternatives Considered

- `@llmthink/server`をnpmへ公開し、rootから正確versionで依存する
  - install可能性は回復するが、service implementationをroot利用者へ配布し、異なるrelease/authority境界を再結合するため不採用
- private server packageをroot tarballへbundleする
  - root単体installは維持できるが、server codeとHosted binをroot releaseへ含め続けるため不採用
- `@llmthink/server`をoptional dependencyにしてfacadeを残す
  - root public entrypointのstatic re-exportはdependency不在時にimport自体を失敗させ、optionalな機能境界にならないため不採用
- facadeを次のmajor release直前までsourceに残す
  - 未公開mainのinstall不能状態を継続し、通常変更とrelease準備の間に壊れた候補を保持するため不採用

## Consequences

Good:

- root npm tarballは公開済みdependencyだけでinstallでき、Hosted service codeを含まない
- root app変更とserver変更のbuild/test/prepack境界が分かれる
- Hosted serviceのdeployment、security、operations releaseをroot CLI/VSIX releaseから独立させられる
- pluginと他のremote clientはsource importでなくcanonical Hosted MCP contractへ依存する

Bad / Risk:

- `llmthink@1.3.0`のHosted server exportと`llmthink-hosted-mcp`利用者には破壊的変更になる
- external server repositoryが作られるまでは、同一repositoryと共有lockfileによるCI/install上の結合が一部残る
- service operator向けの配布・deployment手順はroot npm packageで提供されなくなる

Neutral:

- private `@llmthink/server@1.0.0`のversionとcanonical contract version `1`はroot release versionから独立する
- local stdio MCPはroot packageに残り、Hosted Streamable HTTP MCPとは別のinterfaceとして維持する
- rootからの除外はserver implementation、data format、tenant/revision/idempotency意味論を変更しない

## Implementation Notes

- root manifest and scripts: `package.json`
- root public entrypoint: `src/index.ts`
- service workspace: `packages/server/`
- dependency and pack guard: `test/contracts/server-package-boundary.test.ts`
- local-only adapter test: `test/integration/local-interface-isolation.test.ts`
- focused service CI: `.github/workflows/server.yml`
- task issue: [#37](https://github.com/mako10k/llmthink/issues/37)

## Review

- Package review: root manifest、lockfile、tarballに`@llmthink/server` dependency、Hosted bin、`dist/server/**`がないことを検査する
- API review: root source/generated entrypointがserver symbolをimport/re-exportしないことを検査する
- Boundary review: root app gateがserver build/testを実行せず、server/contract gateはlive producer conformanceを維持することを検査する
- Compatibility review:削除surfaceを次回major変更としてCHANGELOG/version ruleへ記録する
- Authority review: external repository、publish、release、deployment、Production、WIP削除を実行していないことを確認する

## Traceability

- Claim `C-ROOT-SERVER-001`: public root packageはprivate service implementationへruntime依存してはならない
  - Evidence `E-ROOT-SERVER-001`: ADR-0019実装時のroot manifestは未公開`@llmthink/server@1.0.0`へ依存し、root tarballはworkspace packageを同梱しなかった
  - Evidence `E-ROOT-SERVER-002`: ADR-0019はprivate workspace期間のdistribution判断を未解決riskとして記録した
- Claim `C-ROOT-SERVER-002`: Hosted serviceとroot local toolsは異なるrelease/test境界を持たなければならない
  - Evidence `E-ROOT-SERVER-003`: Issue #29はHosted MCP/REST/OAuth/SQLite/operationsをserver境界へ、CLI/local stdio MCPをlocal/core境界へ分類する
  - Evidence `E-ROOT-SERVER-004`: canonical contractとConformance Kitはroot source importなしでproducer/consumerを検証できる
- Claim `C-ROOT-SERVER-003`:公開済みsurface削除は互換性上のmajor変更として扱わなければならない
  - Evidence `E-ROOT-SERVER-005`: `llmthink@1.3.0`はHosted server symbolsと`llmthink-hosted-mcp` binを公開している
- Action `A-ROOT-SERVER-001` (`C-ROOT-SERVER-001`): root dependency、export、bin、facade、packed artifactを削除する
  - Status: implemented by Issue #37
- Action `A-ROOT-SERVER-002` (`C-ROOT-SERVER-002`): root app gateとserver/contract gateを分離する
  - Status: implemented by Issue #37
- Action `A-ROOT-SERVER-003` (`C-ROOT-SERVER-003`): next root releaseのmajor requirementをversion/release文書へ記録する
  - Status: implemented by Issue #37

## Follow-ups

- external server repository作成前にvisibility、release owner、service deployment、Issue/PERT successor manifestを確認する
- managed OAuth、SQLite lifecycle、backup/archive/restoreをserver境界へ個別移管する
- next root release candidateでmajor version、migration note、公開成果物を凍結してreadbackする

## Auditability Notes

- root manifest、source、generated entrypoint、tarballのいずれかにHosted server dependency/export/bin/artifactが戻った場合は境界違反とする
- root app testまたはprepackがserver build/testを暗黙実行した場合はrelease/test境界違反とする
- private server workspaceをroot npm packageと同時publishした場合はservice-only decisionの再判断を必要とする
- Hosted surface互換をroot packageへ再導入する提案が出た場合は、network contractでは不足する具体的use caseを要求する
- repository分離を根拠にdeployment、Production、release、WIP削除を完了扱いにしてはならない
