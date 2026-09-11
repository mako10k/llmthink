# 独立レビュー報告: Impact-Aware RCA Profile R1 要求R4 日本語全文訳

本書は`rca-r4-independent-review.md`のレビュー支援用日本語全文訳であり、正本ではない。

状態: completed、Step 3報告

レビュー日: 2026-09-11

First-owner route: `REVIEW_THEN_DECIDE`

オーナー追加質問: なし

Reviewer: candidate authoring stateをread-onlyに保持したCodex independent-review pass

## レビュー対象snapshot

| Subject                   | Path                                             | SHA-256                                                            |
| ------------------------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| RCA Profile R1要求R4候補  | `docs/requirements/rca-profile-r1-r4.md`         | `890bf0c0cd1b704e7c2822299e46ce39750b7751e1132050818be0ff43ebc90f` |
| RCA R4レビュー入力        | `docs/requirements/rca-profile-r1-r4.review.md`  | `7bdc04b62714480944d81ca978d20ded209620d9e80687c6594a1091703b6ea6` |
| 受入済みGeneric V2 R2要求 | `docs/requirements/generic-profile-v2-r2.md`     | `89f20a526d4bf67df4c9576b529d3e8b13a617218935d12551fc2e3f0b9e8cc8` |
| 先行R3独立レビュー        | `docs/requirements/rca-r3-independent-review.md` | `1369e12e0c694ef45dff5bb3be5c3201fa60dde6a142db7b670fa39f65dacc4f` |

候補とレビュー入力のdigestはレビュー前後に再読した。候補bytesは編集していない。

## 確認したevidence

- GitHub Issue #44現行本文digestは
  `e8998c62c2c8ff7de9ab3725f9ecd62b301b63249626baff8927815a93f76d4b`のままで、固定sourceと一致した。
- Generic V2 R2は引き続き正確な受入済みpredecessorであり、section 7に記載した12個のclosed constraint
  operatorだけを公開する。
- R4を、R3の2 contradictionと2 evidence gap、R4の22 capability acceptance criteriaすべて、8 fixture、
  13 stable rule、completion semantics、V1 coexistence、help navigation、migration、trust boundaryと比較した。
- レビューreasoning auditは`fatal=0`、`error=0`、`warning=0`で完了した。

## 結果概要

- R4はR3の2 contradictionを修復した。Target間dependency/propagationが明示され、settled caseはcorrection、
  containment、recovery、prevention pathで使うactionがnon-effectiveまたはpassed verificationなしの場合に拒否される。
- R4はsuccessor identityとorderingもdistinct nodeとlogical relation orderとして固定した。
- Completion modelには新しいhigh contradictionが2件残る。
- Medium evidence gapが1件、宣言されたcapability proof gateの背後に意図的に未解決のまま残る。
- 正確なsnapshotとsource authorityを利用でき、記載済みcontractからcontradictionを判断できるため、本reportは
  `not-reviewable`ではなく`completed`である。
- Step 4推奨: `REVISE`。以下の2 completion loopholeを残したままR4を受け入れるべきではない。

## Contradiction

### CR-RCA4-001 — high — 未解決follow-up actionがsettled caseと共存できる

Issue #44はaction後のverificationを要求し、implemented countermeasureをverificationなしにeffectiveまたは
completeとして扱うことを拒否する。R4 section 6.9は、failed/inconclusive verificationがpending trackerの代わりに
distinctな`requires_followup` actionを持てば、直近のstructural obligationを満たせる。しかし、そのsuccessor actionを
`corrects`、`contains`、`recovers`、`prevents`のいずれかで接続することも、caseをsettledにする前にeffectiveとして
verificationをpassすることも要求しない。

`RCA-R1-009`と`RCA-R1-010`はこの経路を塞がない。Rule 009にはpending nodeが見えず、rule 010は4種のaction relationで
使用されるactionだけを対象とする。Rule 012はfollow-upの存在とdistinct性だけを検査する。そのためcaseはfailed
verificationとproposedかつunverifiedなsuccessor actionだけを含みながら、記載されたsettled-case rejectionをすべて
回避できる。

これはtest不足ではなく、R4のaction/completion contractで生成されたrequirement-model contradictionである。新しい
requirement revisionでは、reviewerが修復方式を選ぶことなく、未解決successor workをsettled completionと非互換にし、
stable-ruleとfixture coverageを割り当てる必要がある。

### CR-RCA4-002 — high — target relation chain全体をすべてのimpact scope外に残せる

Issue #44は、downstream artifact dependency/propagationを含む明示的impact universeと、そのtarget assessmentを要求する。
R4 section 5.7は、relation endpointのどちらかがすでに`in_scope`の場合に限りscope membershipを閉じ、他方にも同じscopeの
membershipを要求する。`depends_on`または`propagates_to_target`の両endpointがすべてのscope外なら、条件は空虚に成立する。

`RCA-R1-013`にも同じ抜けがある。Either endpointを含むevery scopeでboth membershipを検査するが、この場合はそのscopeが
存在しない。Completionはin-scope targetだけをassessmentする。そのためsame-case target chainを宣言し、その全体を
author-declared universe外で未assessmentのまま、`settled`と共存させられる。

これは宣言済みdownstream artifactに対するimpact-universe outcomeと矛盾する。生成phaseはR4のscope-membership requirementで
ある。新しいrevisionでは、未宣言のreal-world targetのautomatic discoveryを要求せずに、宣言済みtarget relation向けの
non-vacuous scope obligationとstable findingを確立する必要がある。

## Evidence gapと未解決unknown

### EG-RCA4-001 — medium — correlated closed-operatorの表現可能性は未実証のまま

Generic V2 R2は12個のclosed operatorを列挙し、kind、relation、property、state、containmentによるselectorと、`all`、`any`、
`not`の組合せを許す。正確なprofile schemaや実証済みvariable-binding semanticsはまだ提供しない。R4はscope、impact、
assessment、target-chain、verification/follow-up pathをまたぐshared-identity比較を要求し、distinct-node検査も含む。

R4はこれを表現可能と主張していない点では正しい。Section 7.1、13、15はexact minimal profile fragmentをcapability-acceptance
gateにし、失敗時はhidden codeや未宣言operatorを認可せずGeneric contract reconciliationへ戻す。したがって、このevidence
gapはmaterialなままだが、それ自体はR4のcontradictionではない。Requirement acceptanceは、この明示的な不確実性と戻り先を
受け入れるのであり、implementation feasibilityを証明しない。

## Optionalまたはfuture candidate

- 正確なRCA requirementの受入後、`plans/rca-profile-v2.pert`を最終rule数、fixture数、target relation、proof gate、help obligationと
  整合する。現状の古い6-fixture表記はplanning workであり、このreviewed requirement snapshotのcontradictionではない。
- Namespace-aware query、fetched target catalog、operational incident integrationはfuture candidateのままで、acceptance blockerではない。

## Out of scope確認

R4は、factual cause/impact judgment、implicit target discovery/fetch、profile-supplied code、V1 cutover、namespace/ACL work、
thought-store mutation、ADR/design work、PERT mutation、implementation、commit、push、release、publication、deployment、Issue mutation、
operational incident actionを認可しない。Review findingからこれらのeffectをscopeへ昇格させるものはない。

## Step 4判断

オーナーは変更されていないR4 snapshotに対して、次のうち正確に1つを選択する。

- `REVISE`: Step 1へ戻り、新しいcandidate revisionとreview-input revisionを作成する。
- `REREVIEW`: candidate digestを変更せず、review questionを追加または変更し、Step 3とStep 4を繰り返す。
- `ACCEPT`: 報告されたfindingを認識したうえで、正確なcandidate bytesを受け入れる。

本reportは`REVISE`を推奨する。CR-RCA4-001とCR-RCA4-002により、未解決の宣言済みworkまたは未assessmentの宣言済み
downstream targetを残したcaseがstructurally settledになり得るためである。Review完了自体は、後続artifactやexternal effectを
認可しない。
