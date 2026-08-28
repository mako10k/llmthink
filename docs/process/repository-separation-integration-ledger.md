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
| `60b229f..b54ea44` |     4 | onboarding、recovery/archive、Stage lifecycle acceptance                         | server                       | forward-port and re-test                                 |
| `df62f34`          |     1 | limited trial Plugin distribution candidate                                      | plugin                       | migrated to `llmthink-chatgpt-plugin@b480c84`            |
| `8c0c0ca..df8e683` |     9 | hosted lifecycle deployment、OAuth scopes、browser onboarding、tenant deletion   | server                       | forward-port; deployment remains separately authorized   |
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

### 2. Contract artifact and Conformance Kit

- MCP input/output/error/scope schemaとcompatibility hashをserver内部実装から分離する。
- downstreamがserver sourceなしで検証できるConformance Kitを提供する。
- contract/schemaまたはdependency version変更時だけdownstream compatibility testを起動する。

### 3. Hosted server

- `llmthink-server`へHosted MCP、REST、OAuth、lifecycle、SQLite、backup、archiveを移管する。
- `@llmthink/core`とcontract artifactを検証済みの正確versionへ固定する。
- WIPのserver codeをCore workspace後のimport境界へforward-portし、server固有testを再実行する。
- `plans/oauth-implementation.pert`、`plans/trial-account-lifecycle.pert`、release/security/operations義務を後継ownerへ移す。
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
