# Core Package and Test Boundary

## 目的

Coreの内部変更をHosted server、LSP、plugin、VSIXの全回帰検査から分離しつつ、公開contract変更だけは下流互換性を検査する。

## 所有範囲

| 境界                                                                            | 所有するもの                                                                                  | 所有しないもの                                 |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `@llmthink/core`                                                                | DSL、parser、AST/model、analyzer、DSLQL、audit report、v1互換runtime config/embedding adapter | server、thought persistence、LSP、plugin、VSIX |
| root `llmthink`                                                                 | CLI/MCP adapter、thought persistence、LSP、Hosted server、Core互換facade                      | Core内部実装、plugin配布物                     |
| [`llmthink-chatgpt-plugin`](https://github.com/mako10k/llmthink-chatgpt-plugin) | manifest、Skills、assets、evals、plugin固有contract/secret検査                                | Core/server source、Hosted service運用         |
| downstream contract                                                             | Core public export、正確version、DSLQL/help/VSIX共有surface                                   | Core内部関数、private file layout              |

依存方向はroot applicationから`@llmthink/core`への一方向とする。Core sourceはroot `src`、外部plugin、vscode-extensionを参照しない。pluginは固定MCP contract snapshotだけに依存し、本repositoryのsourceをimportしない。

## 変更別の検査

| 変更                                              | 必須コマンド                                  | 通常は不要な検査                       |
| ------------------------------------------------- | --------------------------------------------- | -------------------------------------- |
| Core内部実装・Core test                           | `npm run typecheck:core`、`npm run test:core` | server、LSP、plugin、VSIX test         |
| Core public export・package version・共有registry | 上記 + `npm run test:contract`                | 全server integration test              |
| root application/adapter                          | `npm run test:app`                            | Core unit testの再実行（Core未変更時） |
| release candidate・明示的全体回帰                 | `npm run test:all`、`npm run test:contract`   | なし                                   |

`test:contract`はCoreをbuildし、次を確認する。

- root packageがCoreの正確versionを指定している
- Core sourceがapplication/adapter側へescape importしない
- root sourceがCoreの旧内部pathを参照しない
- root compatibility facadeとTypeScript利用箇所がCore public APIで解決できる
- DSLQL registry、Help、VSIX grammar/snippetの共有surfaceが一致する
- root配布物のexample catalogが従来どおり解決できる

## packageとrelease

- root `llmthink`は`@llmthink/core`の正確versionに依存する
- workspace内でもroot dependency versionとCore package versionを一致させる
- releaseではCore tarballを先に凍結・公開し、そのreadback後にroot packageを公開する
- repository分離までは同じrelease versionを共有する
- public exportを変えずCore内部だけをrefactorする場合、Core単体検査を既定とする

## 現段階の制約

runtime configとembedding provider adapterはv1 API互換性のためCoreに残る。この配置はI/O-free Coreの最終判断ではないが、具体的な利用要件なしに追加分割しない。

## Non-goals

- parser、model、analyzer、DSLQLを別packageへ細分化すること
- Core変更時に全体E2Eを廃止すること
- workspace分離だけでplugin/server/VSIXのrepository分割を完了扱いにすること
- repository分割、package publish、deployment、Production activationを暗黙に行うこと

後続repository分離と長期WIPの移管条件は、[Repository Separation Integration Ledger](repository-separation-integration-ledger.md)で管理する。
