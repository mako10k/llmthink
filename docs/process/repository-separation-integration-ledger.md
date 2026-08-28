# Repository Separation Integration Ledger

## 目的

Issue #29で固定したCore、Hosted server、ChatGPT plugin、VS Codeのrelease境界へ、長期WIP branchの成果と未完了義務を漏れなく移管する。branch数を減らすこと自体を目的に未完了WIPを`main`へ混ぜず、各成果物が後継境界で検証された後にWIP branchを削除する。

本台帳はrepository split、remote repository作成、deployment、Production activation、release、publication、参加者招待を認可しない。

## 確認済みbaseline

2026-08-28にremoteを再取得して次を確認した。

- canonical base: `origin/main` at `4342418bba32863d5d0069a63c482c821c49c35f`
- WIP source: `origin/work/trial-lifecycle-terms-20260820` at `c205a7d8ff371f5ce36f4fe558f20f8b7d7b2aa9`
- open pull request: 0
- `origin/main`固有: 9 commits
- WIP固有: 66 commits
- WIP固有のうちmainとpatch-equivalent: 2 commits
- 後継判断が必要なWIP固有: 64 commits

three-way mergeのread-only simulationでは`changed in both` 36件、`removed in local` 28件、`added in both` 1件が現れた。さらにmainのADR-0017はCore workspace境界、WIPのADR-0017はNode SQLite driverを指している。したがって、WIP全体を現行mainへ直接mergeしない。

## 統合原則

- 通常作業は検証済み`origin/main`から開始する。
- 同時に進めるtask branchは原則1本とし、PR、merge、readback、cleanupを終えてから次へ進む。
- 長期WIP branchはserver移管が完了するまでの一時的なsource authorityとしてのみ維持する。
- commit単位の機械的cherry-pickを完了条件にしない。Core workspace後の依存方向へ適応したforward-portと、後継境界でのtestを必要とする。
- deployment evidence、terms、backup、OAuth、SQLite、Plugin distributionの義務を、repository splitによって完了扱いにしない。
- secret、token、個人情報、provider credentialを移管成果物へ追加しない。

## WIP commit coverage

WIP固有66 commitsは次の連続範囲で全件を覆う。

| WIP range          | Count | 内容                                                                             | 後継境界                     | disposition                                              |
| ------------------ | ----: | -------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------- |
| `fc66706..f85e5d1` |     4 | managed OAuth runtime、registry access、deployment frontier                      | server                       | forward-port                                             |
| `9099f6f..7979c65` |     4 | trial provisioning、SQLite control plane/schema/core                             | server                       | forward-port                                             |
| `c74c012..f84886c` |     4 | trial terms、status page、lifecycle handoff                                      | server operations            | forward-port with authority review                       |
| `4ddc185..78e54af` |     8 | backup threat model、R2/restic decisions、implementation plan                    | server operations            | forward-port                                             |
| `8da524f..725c41d` |    12 | backup generation、restic adapter、restore、supply verification、technical tests | server                       | forward-port and re-test                                 |
| `ab7f2f2..53de27d` |    10 | backup evidence、production rehearsal、off-host restore                          | server operations            | preserve evidence and rebind exact revisions             |
| `9748b34..8f433ed` |     5 | trial terms approval and acceptance records                                      | server operations            | preserve governance evidence                             |
| `60b229f..b54ea44` |     4 | onboarding、recovery/archive、Stage lifecycle acceptance                         | server                       | onboarding bridge migrated by #35; remainder pending     |
| `df62f34`          |     1 | limited trial Plugin distribution candidate                                      | plugin                       | migrated to `llmthink-chatgpt-plugin@b480c84`            |
| `8c0c0ca..df8e683` |     9 | hosted lifecycle deployment、OAuth scopes、browser onboarding、tenant deletion   | server                       | delete migrated by #35; lifecycle/operations pending     |
| `a40cc59`          |     1 | sealgraph artifact formatting exclusion                                          | history only                 | do not port unless successor reproduces the need         |
| `d5b61da`          |     1 | OAuth limited trial distribution candidate                                       | plugin and server operations | plugin migrated at `b480c84`; operations remain on WIP   |
| `78f2fa3..82ac156` |     2 | rational confidence implementation and example verification                      | core                         | already patch-equivalent on main; do not port            |
| `c205a7d`          |     1 | Node SQLite lifecycle driver acceptance                                          | server                       | forward-port decision, implementation, and focused tests |

Coverage count: `4 + 4 + 4 + 8 + 12 + 10 + 5 + 4 + 1 + 9 + 1 + 1 + 2 + 1 = 66`.

## 実施順序

### 1. ChatGPT plugin — completed 2026-08-28

- public successor: [`mako10k/llmthink-chatgpt-plugin`](https://github.com/mako10k/llmthink-chatgpt-plugin)
  `main@b480c8444c6360ce8c3af785110e9d5fa03f21a0`
- plugin testはroot/server sourceをimportせず、manifest、marketplace、eval、secret、固定MCP
  contract snapshotのみを検証する。
- plugin version `1.2.0+codex.20260821115249`、MCP contract version `1`、contract SHA-256
  `774fb22a3ce4d6225cef7c791dc006414cf2795c54de308d08db17ed0245343d`、tested server
  `1.2.0@df8e6830dd985a3786c77bc1f1f99922e5144947`を固定した。
- `df62f34`と`d5b61da`のplugin artifact、install/update/remove、secret検査を移管し、未完了の
  distribution/interoperability義務は後継[Issue #1](https://github.com/mako10k/llmthink-chatgpt-plugin/issues/1)で保持する。
- local plugin validator、plugin-only test 4件、GitHub Actions
  [`plugin-ci`](https://github.com/mako10k/llmthink-chatgpt-plugin/actions/runs/33142892243)が成功した後、
  元repositoryのplugin配布物とserver source依存testを除去した。
- repositoryはpublicだが、service admission、Production activation、deployment、general
  registration、universal-directory publicationは実行も認可もしていない。

### 2. Contract artifact and Conformance Kit — completed 2026-08-28

- private workspace `@llmthink/contracts@1.0.0`を同一repositoryに作り、contract専用repositoryや
  package publicationを増やしていない。
- pluginとbyte-equivalentなHosted MCP v1 surface artifactをSHA-256
  `774fb22a3ce4d6225cef7c791dc006414cf2795c54de308d08db17ed0245343d`で固定した。
- input/output/error/scope/effect schemaを別artifactへ分離し、manifestで各hashとtested
  producer `df8e683`、retained source `c205a7d`、consumer `b480c84`を記録した。
- Conformance Kitはserver/plugin sourceをimportせず、artifact、producer descriptor、consumer
  snapshotを検証する。
- contract/schema/dependency pathだけでfocused testとdownstream plugin compatibilityを起動する。
- 抽出時点のHosted MCP adapterはtested surfaceより古かったため、live producer bindingをIssue #29の
  server分離へ移管した。artifact/Kit抽出は[Issue #33](https://github.com/mako10k/llmthink/issues/33)、
  producer結合は[Issue #35](https://github.com/mako10k/llmthink/issues/35)で管理する。

### 3a. Hosted server workspace and live producer — completed 2026-08-28

- private workspace `@llmthink/server@1.0.0`へHosted Application Service、file repository、REST、
  Streamable HTTP MCP、policy/securityとserver専用testを移した。
- `@llmthink/core@1.3.0`と`@llmthink/contracts@1.0.0`へ正確versionで固定し、server sourceから
  root application/local thought storeへのimportを禁止した。
- retained WIPからcanonical surfaceに必要なonboarding bridgeとtenant/revision/idempotency-bound deleteだけを
  forward-portした。OAuth、trial lifecycle、backup、deployment evidenceは混ぜていない。
- implementation-owned registryをcanonical SHA-256
  `774fb22a3ce4d6225cef7c791dc006414cf2795c54de308d08db17ed0245343d`とConformance Kitで照合する。
- 初期抽出ではrootに既存Hosted bin/exportのcompatibility facadeを残し、path-limited server CIを追加した。
- external repository、package publication、deployment、Production activationは実行していない。

### 3b. Root package decoupling — completed 2026-08-28

- [Issue #37](https://github.com/mako10k/llmthink/issues/37)とADR-0020でHosted serverをservice-only境界とした。
- rootから`@llmthink/server` runtime dependency、public re-export、`llmthink-hosted-mcp` bin、compatibility facadeを削除した。
- root app build/test/typecheck/prepackはserver build/testを要求せず、root tarballは`dist/server/**`を含まない。
- private server workspace、canonical contract、focused server CIは独立して維持する。
- 公開済みroot surfaceの削除は次回root releaseのmajor変更としたが、version bump、release、publishは実行していない。

### 3c. Hosted server remaining migrations

- managed OAuth、account registry、browser onboarding、trial lifecycleを個別にforward-portする。
- SQLite lifecycle control planeとaccepted Node SQLite driver decisionをfocused testで再現する。
- backup/archive/restore implementationとoperations evidenceを分けて移管する。
- `plans/oauth-implementation.pert`、`plans/trial-account-lifecycle.pert`、release/security/operations義務を後継ownerへ移す。
- external repository visibility、service release owner、deployment手順を別途決定する。
- ADR番号は後継repository内で一意性を再確認し、旧branch上の証拠参照を失わない形で正規化する。

### 4. VS Code

- `llmthink-vscode`へextension、preview、TextMate grammar、LSP client、配布用language serverを移管する。
- Coreおよびlanguage contractの正確versionへ固定する。
- Issue #1のworkspace-wide symbol indexを後継repositoryへ移す。

### 5. Backlog ownership

- Issue #24と#25はCore境界に残す。
- Issue #26はserver境界へ移す。
- Issue #1はVS Code境界へ移す。
- operations分離は具体的なaccess-controlまたはrelease-owner差が生じるまで採用しない。

## WIP branch削除gate

`work/trial-lifecycle-terms-20260820`は、次をすべて満たしたreadback後にだけlocal/remoteから削除する。

- 上表66 commitsの各rangeに、後継SHAまたは`history only`の根拠がある。
- plugin、contract、serverの後継testがそれぞれのrepositoryで成功している。
- OAuth、lifecycle、backup、terms、distribution、reconciliationの未完了PERT義務に後継ownerがある。
- Issue #28のSQLite driver判断が後継serverで再現可能である。
- deployment、Production activation、release、publicationをrepository splitだけで実行していない。
- WIP branchをheadとするopen PRがない。
- 削除直前にremote SHA、successor SHA、coverage countを再取得している。

削除は個別のauthorized cleanupとして1回だけ実行し、local refsとremote refsを読み戻す。
