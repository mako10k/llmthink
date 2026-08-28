# Core Package and Test Boundary

## 目的

Coreの内部変更をHosted server、LSP、plugin、VSIXの全回帰検査から分離しつつ、公開contract変更だけは下流互換性を検査する。

## 所有範囲

| 境界                                                                            | 所有するもの                                                                                  | 所有しないもの                                 |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `@llmthink/core`                                                                | DSL、parser、AST/model、analyzer、DSLQL、audit report、v1互換runtime config/embedding adapter | server、thought persistence、LSP、plugin、VSIX |
| `@llmthink/contracts`                                                           | versioned artifact、shared Hosted API、hash manifest、Conformance Kit                         | server実装、plugin実装、deployment             |
| `@llmthink/server`                                                              | Hosted Application Service、request context、repository、REST/HTTP MCP、policy、live producer | shared Hosted API、local CLI/plugin/VSIX       |
| root `llmthink`                                                                 | local CLI/stdio MCP、thought persistence、LSP、Core互換facade、Hosted bin/export facade       | Core内部実装、Hosted server実装、plugin配布物  |
| [`llmthink-chatgpt-plugin`](https://github.com/mako10k/llmthink-chatgpt-plugin) | manifest、Skills、assets、evals、plugin固有contract/secret検査                                | Core/server source、Hosted service運用         |
| downstream contract                                                             | Core public export、正確version、DSLQL/help/VSIX共有surface                                   | Core内部関数、private file layout              |

依存方向はContractsからCoreへのtype-only依存、ServerからCoreとContractsへのruntime/type依存、root applicationからCoreへのruntime依存とする。rootのServer依存は公開互換用`src/index.ts`と`src/server/hosted-main.ts`に限定する。Core、Contracts、Serverはroot `src`、外部plugin、vscode-extensionを参照しない。pluginは固定MCP contract snapshotだけに依存し、本repositoryのsourceをimportしない。

## 変更別の検査

| 変更                                              | 必須コマンド                                            | 通常は不要な検査                       |
| ------------------------------------------------- | ------------------------------------------------------- | -------------------------------------- |
| Core内部実装・Core test                           | `npm run typecheck:core`、`npm run test:core`           | server、LSP、plugin、VSIX test         |
| Core public export・package version・共有registry | 上記 + `npm run test:contract`                          | 全server integration test              |
| Contract artifact・schema・Conformance Kit        | `npm run test:contracts`、`npm run typecheck:contracts` | server実装、SQLite、OAuth、VSIX test   |
| Shared Hosted API type/literal                    | 上記 + `npm run test:contract`、`npm run test:server`   | local LSP、VSIX test                   |
| Hosted server実装・server test                    | `npm run test:server`、`npm run typecheck:server`       | Core unit、plugin、VSIX test           |
| root application/adapter                          | `npm run test:app`                                      | Core unit testの再実行（Core未変更時） |
| release candidate・明示的全体回帰                 | `npm run test:all`、`npm run test:contract`             | なし                                   |

`test:contract`はCoreをbuildし、次を確認する。

- root packageがCoreの正確versionを指定している
- Core sourceがapplication/adapter側へescape importしない
- root sourceがCoreの旧内部pathを参照しない
- root compatibility facadeとTypeScript利用箇所がCore public APIで解決できる
- DSLQL registry、Help、VSIX grammar/snippetの共有surfaceが一致する
- root配布物のexample catalogが従来どおり解決できる

## packageとrelease

- root `llmthink`は`@llmthink/core`の正確versionに依存する
- private `@llmthink/contracts`はshared Hosted APIの`AuditReport`型のため`@llmthink/core`の正確versionに依存する
- private `@llmthink/server`は`@llmthink/core`と`@llmthink/contracts`の正確versionに依存する
- workspace内でもroot dependency versionとCore package versionを一致させる
- releaseではCore tarballを先に凍結・公開し、そのreadback後にroot packageを公開する
- `@llmthink/server`はworkspace分離中のprivate packageであり、外部repositoryまたはpackageとして公開しない
- rootはprivate server packageへ実行時依存するため、server distribution方式を決定するまで次回root publicationを開始しない
- public exportを変えずCore内部だけをrefactorする場合、Core単体検査を既定とする
- `@llmthink/contracts`はprivate workspaceとして開始し、publication authorityなしにpublishしない
- contract/schema/dependency pathの変更時だけserver/plugin downstream compatibility workflowを実行する

## 現段階の制約

runtime configとembedding provider adapterはv1 API互換性のためCoreに残る。この配置はI/O-free Coreの最終判断ではないが、具体的な利用要件なしに追加分割しない。

Hosted MCP v1のcanonical 11-tool surfaceはserver-owned registryへ結合済みである。ただしonboardingはMCP bridge、deleteはhosted repository lifecycleに限定され、managed OAuth/browser account lifecycle、SQLite、backup/archive/restore、deployment operationsは未移管である。

Hosted API version、scope、error code、serializable command/query/result型の正本はContractsにある。
verified request context、repository/persistence、validator、security、transport、live registryはServerに残る。
root compatibility facade/binとprivate Server dependencyは次の配布・互換判断まで維持し、root release holdを解除しない。

## Non-goals

- parser、model、analyzer、DSLQLを別packageへ細分化すること
- Core変更時に全体E2Eを廃止すること
- workspace分離だけでplugin/server/VSIXのrepository分割を完了扱いにすること
- repository分割、package publish、deployment、Production activationを暗黙に行うこと

後続repository分離と長期WIPの移管条件は、[Repository Separation Integration Ledger](repository-separation-integration-ledger.md)で管理する。
