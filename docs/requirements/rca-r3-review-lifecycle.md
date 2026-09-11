# RCA要求R3 レビュー lifecycle

状態: Step 4完了、R3未受入、R4改訂へ返却

作成日: 2026-09-11

基準main: `8cce0d9812f4d1841e2c26c96c29ed6982bb34c9`

## Authorityと前提

- オーナー判断 `Generic ACCEPT、RCA REVISE` により、Generic V2 R2の正確な候補snapshotは受入済み。
- RCA R2は未受入のまま改訂へ返却され、R3は新しいStep 1として開始した。
- R2の独立レビュー結果はrevision evidenceであり、R3のreview statusまたは受入を構成しない。
- 本lifecycleとR3候補の作成は、独立レビュー、RCA受入、ADR、design、PERT変更、実装、migration、
  commit、push、release、deploymentを認可しない。

## Snapshot一覧

| Role                              | Path                                                       | SHA-256                                                            |
| --------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| 受入済みGeneric V2 R2英語正本     | `docs/requirements/generic-profile-v2-r2.md`               | `89f20a526d4bf67df4c9576b529d3e8b13a617218935d12551fc2e3f0b9e8cc8` |
| Generic V2 R2受入記録             | `docs/requirements/generic-profile-v2-r2.acceptance.md`    | `0a1f963b9bdd81acc5c8334d7153a750c8ddedb4f3807725d165c9c318ee949e` |
| Generic V2 R2受入記録日本語全文訳 | `docs/requirements/generic-profile-v2-r2.acceptance.ja.md` | `ce669ef1c0e50e7d845b252234592b685d5f5205b62e9b28332f9550f778e737` |
| RCA R2独立レビュー報告            | `docs/requirements/v2-r2-independent-review.md`            | `7081bf41bd1be9bbb53d14aa713bef22bb845afb6cfecdc2022346652ac71ae8` |
| RCA R2レビュー報告日本語全文訳    | `docs/requirements/v2-r2-independent-review.ja.md`         | `9544e2375520c9fa4f808be4519e6ead549a96e76cbe2c39e5ecf0448ec17ed8` |
| RCA R3英語正本候補                | `docs/requirements/rca-profile-r1-r3.md`                   | `6f3817a9285d7cbea6b7981977e8765a5a31060205f91fa15d464b008c132312` |
| RCA R3日本語全文訳                | `docs/requirements/rca-profile-r1-r3.ja.md`                | `4c98a592c5f72f8d9bfc34dca3650a51c942f2427ad434247673080e8e9a2613` |
| RCA R3独立レビュー入力            | `docs/requirements/rca-profile-r1-r3.review.md`            | `60c7189e55b038dd803b20ba5cad304a787804dc1c48a63148930cdfad959629` |
| RCA R3レビュー入力日本語全文訳    | `docs/requirements/rca-profile-r1-r3.review.ja.md`         | `dad28ba4a2eeaef1305eb9eaed4fa4018db59a2123a1dc1a82d11a871c6512d5` |
| RCA R3独立レビュー報告            | `docs/requirements/rca-r3-independent-review.md`           | `1369e12e0c694ef45dff5bb3be5c3201fa60dde6a142db7b670fa39f65dacc4f` |
| RCA R3レビュー報告日本語全文訳    | `docs/requirements/rca-r3-independent-review.ja.md`        | `5d06eb725b70f53835be5546d20fccc9f0876ed40adbf2f0466f67a70fb51f81` |

## Step 1改訂結果

- `covered_by`を追加し、各phenomenonを同じ`rca_case`が所有するimpact scopeへ正確に1つ関連付けた。
- 全impactにphenomenonからのpropagation pathを要求し、全applicable scope内のtargetへの`applies_to`を
  要求した。
- Realized impactはcurrent `affected`、credible impactはcurrent `affected | suspect`を要求し、current
  `affected`からrealized impactへの逆向きobligationも定義した。
- Containment/recovery/pending obligationを、未定義だった「unresolved credible impact」ではなく、
  current target assessmentとapplied impactの組み合わせで定義した。
- `requires_followup`を追加し、failed/inconclusive verificationをincoming `tracks`またはoutgoing
  successor actionとして表現可能にした。
- 全relation endpoint categoryを正確なnode-kind集合へ展開した。
- Stable rule `RCA-R1-001`、`003`、`008`、`012`、structural completion、受入基準を上記変更へ整合させた。
- Generic V2 R2の受入snapshot、V1既定、profile固有parser禁止、ヘルプナビゲーション要求は維持した。

## Self-review結果

- R2 high contradiction 2件に対応する構造とstable-rule conditionをR3本文へ追加した。
- R2 medium evidence gap 2件に対応するscope associationとendpoint集合をR3本文へ追加した。
- R2 review inputの古いrevision表記はR3 review inputへ持ち越していない。
- 変更はclosed declarative profile constraintの範囲内で、Generic V2拡張やexecutable profile behaviorを
  要求していない。
- Exact profile JSON、最終message text、実世界のimpact universe、publication/package/releaseは引き続き
  downstreamまたは未決定である。
- 独立レビューは未実施であり、R3は未受入である。

## Step 2結果

- オーナーroute: `REVIEW_THEN_DECIDE`
- オーナー追加質問: なし
- 対象: RCA R3候補
  `sha256:6f3817a9285d7cbea6b7981977e8765a5a31060205f91fa15d464b008c132312`

## Step 3結果

- 状態: `completed`
- R2改訂原因の4 findingはR3で対処済みと確認した。
- RCA R3候補にhigh contradiction 2件を検出した。
  - Issue #44が要求する下流成果物間dependency/propagation relationがない。
  - Implemented未検証actionを含むsettled caseのcompletion拒否とstable-rule coverageが定義されていない。
- Medium evidence gap 2件を記録した。
  - Multi-path scope/impact/assessment相関をGeneric V2 closed operatorだけで表現できるか未実証。
  - `requires_followup`のsuccessor actionが既検証actionと異なる必要があるか、その順序をどう表すか未定義。
- Optional/future候補とscope外項目をacceptance blockerへ昇格させていない。
- Candidate bytesは変更しておらず、レビュー前後のdigestは一致した。
- Step 4推奨: `REVISE`

## Step 4結果

- オーナー判断: `REVISE`
- RCA R3 exact snapshotは未受入のまま、新しいrequirement revisionのStep 1へ返却した。
- R3 candidate/reportは履歴evidenceとして不変に保全し、R3 review statusをR4へ引き継がない。
- 本判断はR4作成以外のADR、design、PERT変更、implementation、commit、push、release、deploymentを認可しない。

## 次のgate

R3 review findingを新しいR4 candidate、完全日本語訳、review inputへ反映し、新digestでStep 1から再開する。
