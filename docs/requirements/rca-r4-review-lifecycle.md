# RCA要求R4 レビュー lifecycle

状態: Step 3完了、Step 4オーナー判断待ち

作成日: 2026-09-11

基準main: `8cce0d9812f4d1841e2c26c96c29ed6982bb34c9`

## Authorityと前提

- オーナーのR3 Step 4判断 `REVISE` により、R3は未受入のまま新revisionへ返却された。
- Generic V2 R2の正確な候補snapshotは引き続き受入済みである。
- R2/R3独立レビューはrevision evidenceであり、R4のreview statusまたは受入を構成しない。
- 本lifecycleとR4候補の作成は、独立レビュー、RCA要求受入、ADR、design、PERT変更、実装、migration、
  commit、push、release、deploymentを認可しない。

## Snapshot一覧

| Role                           | Path                                                    | SHA-256                                                            |
| ------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------ |
| 受入済みGeneric V2 R2英語正本  | `docs/requirements/generic-profile-v2-r2.md`            | `89f20a526d4bf67df4c9576b529d3e8b13a617218935d12551fc2e3f0b9e8cc8` |
| Generic V2 R2受入記録          | `docs/requirements/generic-profile-v2-r2.acceptance.md` | `0a1f963b9bdd81acc5c8334d7153a750c8ddedb4f3807725d165c9c318ee949e` |
| RCA R3英語正本候補             | `docs/requirements/rca-profile-r1-r3.md`                | `6f3817a9285d7cbea6b7981977e8765a5a31060205f91fa15d464b008c132312` |
| RCA R3独立レビュー報告         | `docs/requirements/rca-r3-independent-review.md`        | `1369e12e0c694ef45dff5bb3be5c3201fa60dde6a142db7b670fa39f65dacc4f` |
| RCA R3完了lifecycle            | `docs/requirements/rca-r3-review-lifecycle.md`          | `b9a207604267bb04bb1764a711b61b21c580ec44b8b4fd69ea96dfd1e337a29a` |
| RCA R4英語正本候補             | `docs/requirements/rca-profile-r1-r4.md`                | `890bf0c0cd1b704e7c2822299e46ce39750b7751e1132050818be0ff43ebc90f` |
| RCA R4日本語全文訳             | `docs/requirements/rca-profile-r1-r4.ja.md`             | `6f1f653cf18dcf2cfb511a4d8030ef45370d10c57062aef3ebaf64800dd4a47e` |
| RCA R4独立レビュー入力         | `docs/requirements/rca-profile-r1-r4.review.md`         | `7bdc04b62714480944d81ca978d20ded209620d9e80687c6594a1091703b6ea6` |
| RCA R4レビュー入力日本語全文訳 | `docs/requirements/rca-profile-r1-r4.review.ja.md`      | `061a46f73a38ee1c87af2bab49eb9d52bdd045987254960bd6b18cef02cdf64a` |
| RCA R4独立レビュー報告         | `docs/requirements/rca-r4-independent-review.md`        | `e76f37b236f406d6e26a562a69cc4b0dd205708685d8f8702fa8bba9daaa8862` |
| RCA R4レビュー報告日本語全文訳 | `docs/requirements/rca-r4-independent-review.ja.md`     | `a1a418452410902fce2d3ad0e9031644a6109305fde22e30d830d24dbc445493` |

## Step 1改訂結果

- `impact_target -> impact_target`の`depends_on`と`propagates_to_target`を追加し、dependencyとpropagationを
  区別した。
- 両relationの逆方向、same-case/different-node endpoint、scope closure、relation別cycle評価、Generic DSLQL
  traversal obligationを固定した。
- Settled caseではcurrent pending nodeを禁止し、`corrects`、`contains`、`recovers`、`prevents`で使う全actionに
  effective状態とpassed incoming verificationを要求した。
- `RCA-R1-009`と`010`をcompletion条件へ整合し、Issue #44 fixture 6のeffectiveまたはcomplete両経路を塞いだ。
- Follow-up actionをverified actionとは異なるnodeとし、`requires_followup`自体をlogical successionと定義して
  wall-clock time推定を禁止した。
- `RCA-R1-011`と`012`を更新し、target relationのcase/scope違反向け`RCA-R1-013`を追加した。
- 必須fixtureを8件へ拡張し、downstream target chain、unverified completion、failed follow-upを直接検証する。
- Correlated ruleのclosed-operator表現力は成功を仮定せず、正確な最小profile fragmentによるcapability受入前
  proof gateとした。失敗時はGeneric contract reconciliationへ戻し、hidden codeや新operatorを許容しない。
- V1既定、Generic V2 R2 snapshot、profile固有parser禁止、offline help navigation、truth/I/O/authority境界は
  維持した。

## Step 1 Self-review結果

- R3 high contradiction 2件は、target relationとsettled completionの規範構造・stable rule・fixtureへ反映した。
- R3 successor-action evidence gapはdistinct-node/logical-order契約へ固定した。
- R3 correlated-operator evidence gapは解消済みと仮定せず、実証failureをGeneric contract phaseへ戻す明示gateに
  した。
- R3 candidate/reportは変更せず、R4は新しいpath/digestでStep 1から開始した。
- External profile reference `rca-impact@1.0.0`は既存候補と同じ提案identityであり、R4 acceptanceまで未受入。
- このStep 1時点では独立レビュー未実施であり、R4は未受入だった。

## Step 2オーナーroute

- オーナー選択: `REVIEW_THEN_DECIDE`
- オーナー追加質問: なし
- 候補本文は変更せず、選択routeだけを日英review inputへ記録してStep 3へ進めた。

## Step 3独立レビュー結果

- Report status: `completed`
- R3のdownstream target relation欠落とimplemented/unverified action rejection欠落はR4で修復された。
- High contradiction `CR-RCA4-001`: failed/inconclusive verification後のdistinct follow-up actionが未実施・未検証でも、
  pendingがなく4種のaction relationに未接続ならsettledを妨げない。
- High contradiction `CR-RCA4-002`: target relationの両endpointが全scope外ならscope closureと`RCA-R1-013`を空虚に
  満たし、未assessmentのchainがsettledと共存できる。
- Medium evidence gap `EG-RCA4-001`: correlated closed-operator表現力は未実証だが、R4はexact fragmentの
  capability gateとGeneric contract reconciliationへの戻り先を明示しており、それ自体はcontradictionではない。
- Review reasoning audit: `fatal=0`、`error=0`、`warning=0`。
- Step 4推奨: `REVISE`。
- 候補bytesはStep 3で変更しておらず、R4は未受入である。

## 次のgate

オーナーが変更されていないR4候補に対して、`REVISE`、`REREVIEW`、`ACCEPT`から正確に1つを選択する。
