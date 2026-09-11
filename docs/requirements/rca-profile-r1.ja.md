# Impact-Aware RCA Profile R1 — 要求候補 R1 日本語全文訳

本書は `rca-profile-r1.md` のレビュー支援用日本語訳であり、正本ではない。要求のauthorityは
英語正本の確定bytesにある。

状態: Step 1候補、自己レビュー済み、未受入  
要求リビジョン: R1  
外部profile名: Impact-Aware RCA Profile R1  
提案profile reference: `rca-impact@1.0.0`  
候補日: 2026-09-11  
決定オーナー: llmthink decision owner

## 1. 目的と依存関係

この候補は、impact-awareなroot-cause analysisを、汎用V2 node/link/operation/query model上の1つの
specialized profileとして定義する。LLMThinkに主張された原因、影響、対策の真偽を判断させず、
欠落とcategory substitutionを構造的に見えるようにしなければならない。

この候補は、`sha256:7312ae5904d36e60f11e67c414d3d7c2fee19ef8a2e789a51115b197603c736b`の
正確なGeneric Profile and Audit Contract V2 R1候補に依存する。並行reviewは可能だが、その正確な
generic contractまたは明示的にreconcileされた後継が先に受け入れられない限り、本候補を受入または
実装してはならない。

## 2. Authorityとsource snapshot

| 入力                        | Snapshot                                                                                       | 本候補での扱い                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| GitHub Issue #44            | 2026-09-11更新、本文 `sha256:e8998c62c2c8ff7de9ab3725f9ecd62b301b63249626baff8927815a93f76d4b` | 主要RCA outcomeと受入authority候補                            |
| GitHub Issue #10            | 2026-05-08更新、本文 `sha256:08d393d8b62676d0426e94c54edecfeb6501c7d8b12d6c96e2851264b5f32f71` | use-case固有parser syntaxよりprofileを優先                    |
| GitHub Issue #25            | 2026-08-19更新、本文 `sha256:e1d77d8b4ac58964ace1303b32299712ea93c5ed2e29ec40a10797bdea5f19df` | Generic V2 profile mechanismであり、独立RCA authorityではない |
| GitHub Issue #43            | 2026-09-08更新、本文 `sha256:5fec6a52fad9b96730e7cc264c5a0175297f21dc4f0d7f8c4e695b1153224076` | pure、fail-closed、evidence-groundedなV1 audit baseline       |
| Generic V2 R1候補           | `sha256:7312ae5904d36e60f11e67c414d3d7c2fee19ef8a2e789a51115b197603c736b`                      | 必須generic contract predecessor、未受入                      |
| `plans/rca-profile-v2.pert` | `sha256:a78302cb3c8e08639029c8b922d0af14f124d91ab1f88a537840e6b67b05caa0`                      | delivery依存とreview順序のみ                                  |

GitHub body digestはCLI追加の末尾改行を含まない正確なUTF-8本文を使用する。

## 3. Issue #44の候補を組み合わせた選択

R1は、オーナー受入向けに次の組み合わせを提案する。

1. **Use-case固有syntax: 不採用。** RCAはparser productionを追加しない。Parser、IR、DSLQL、LSP、
   preview、helpの分岐増加を避ける。
2. **Generic primitiveとversioned profile: 採用。** RCA概念はGeneric V2上のprofile-defined kind、
   property、relation、containment、lifecycle valueとする。
3. **Use-case固有audit: declarative profile constraintとしてのみ採用。** RCA ruleはgeneric closed
   constraint operatorを使用し、profileはcodeやsemantic inferenceを導入できない。

この選択はRCA R1候補だけへ適用する。Generic V2の受入、profile実装、将来の全use caseへのrule確立を
意味しない。

## 4. RCA structural model

1つの`rca_case` containerがanalysisを所有する。R1は次のnode kindを定義する。

- `rca_case`
- `phenomenon`
- `impact_scope`
- `impact_target`
- `impact_assessment`
- `impact`
- `root_cause`
- `contributing_cause`
- `trigger`
- `escape_cause`
- `corrective_action`
- `containment`
- `recovery`
- `recurrence_prevention`
- `verification`
- 継承する`evidence`
- 継承する`pending`

これらの区別は規範的である。特に、`escape_cause`は`root_cause`要求を満たせず、
`corrective_action`は`containment`または`recovery`を満たせず、actionの実装は`verification`または
effectivenessを満たせない。

### 4.1 必須property

- `rca_case`: generic lifecycle state。`settled`は構造的完了を宣言する。
- `impact_scope`: `completeness`は`complete | partial | unknown`。
- `impact_target`: `target_type`は`file | commit | requirement | plan | implementation | test |
report | runtime | remote | deployment | other`、かつ空でないopaque `target_ref`。
- `impact_assessment`: `classification`は`affected | suspect | unaffected | unknown`。
- `impact`: `actuality`は`realized | credible`。
- `corrective_action`、`containment`、`recovery`、`recurrence_prevention`: `action_state`は
  `proposed | implemented | effective`。
- `verification`: `result`は`passed | failed | inconclusive`。

`target_ref`はauthorが記録するidentifierである。Coreはそれをdereferenceせず、そのtypeからauthority、
existence、content、current stateを推定してはならない。

### 4.2 Relationと方向

R1は次のdirected relationを定義する。

| Relation             | From                       | To                                                          | Authorが主張する意味                             |
| -------------------- | -------------------------- | ----------------------------------------------------------- | ------------------------------------------------ |
| `documents_scope`    | `rca_case`                 | `impact_scope`                                              | caseがこのimpact universeを使用する              |
| `in_scope`           | `impact_scope`             | `impact_target`                                             | targetが調査universeに属する                     |
| `assesses`           | `impact_assessment`        | `impact_target`                                             | assessmentがtargetを分類する                     |
| `propagates_to`      | `phenomenon`または`impact` | `impact`                                                    | 宣言されたimpact propagation                     |
| `applies_to`         | `impact`                   | `impact_target`                                             | impactがtargetに適用される                       |
| `supports`           | `evidence`                 | assessment、cause、phenomenon、impact、action、verification | 宣言されたevidentiary support                    |
| `causes`             | `root_cause`               | `phenomenon`または`impact`                                  | 宣言されたproducing cause                        |
| `contributes_to`     | `contributing_cause`       | cause、phenomenon、impact                                   | 宣言されたcontributing condition                 |
| `triggers`           | `trigger`                  | `phenomenon`                                                | 宣言されたsurfacing condition                    |
| `explains_escape_of` | `escape_cause`             | `phenomenon`または`root_cause`                              | 宣言されたdetection/acceptance escape            |
| `corrects`           | `corrective_action`        | rootまたはcontributing cause                                | producing causeを除去またはcontrolする           |
| `contains`           | `containment`              | impactまたはimpact target                                   | 追加propagationを制限する                        |
| `recovers`           | `recovery`                 | impactまたはimpact target                                   | 既にpropagateしたeffectを修復する                |
| `prevents`           | `recurrence_prevention`    | causeまたはphenomenon                                       | 将来のprevention/detection/containmentを改善する |
| `verifies`           | `verification`             | 任意action kind                                             | 実装後のactionを評価する                         |
| `tracks`             | `pending`                  | 任意RCA node                                                | 明示的な未解決obligationを記録する               |

Text、embedding、target type、時間的近接、shared evidence、graph proximityからrelationを推定しない。

## 5. Impact universeとassessment contract

1. 各caseは1つ以上の`impact_scope`を宣言し、`documents_scope`でlinkする。
2. 調査対象の各targetを`in_scope`で明示的に接続する。
3. 各in-scope targetは、currentな`impact_assessment`を正確に1つ持つ。過去assessmentを残せるのは、
   generic stateが`superseded`の場合だけとする。
4. `affected`と`unaffected` assessmentは1つ以上のevidence pathを持つ。`suspect`と`unknown`は、
   evidenceと後続assessmentで解消されない限り`pending` trackerを持つ。
5. `affected` assessmentは、同じtargetへ適用される1つ以上の`realized` impactと接続する。
   `suspect` assessmentは`credible` impactへ接続できる。
6. `completeness=complete`が主張するのは、authorが宣言したuniverseの全memberにassessmentがあること
   だけであり、選択universeが現実世界を網羅することは証明しない。
7. `partial`と`unknown`のscope completenessはraw reportへ残し、caseの構造的完了を禁止する。

## 6. Cause、action、verification contract

1. 構造的に完了したcaseは、各phenomenonへ`causes`で接続する1つ以上の`root_cause`を含む。
   Contributing cause、trigger、escape causeは代用できない。
2. 各root-cause claimは、宣言されたevidence path、またはevidenceをinputに含みそのcauseをoutputにする
   明示的generic operationを持つ。
3. 各root causeは1つ以上のcorrective actionの対象になる。
4. 各affected targetと各未解決credible impactは、containment、recovery、または`pending` trackerを持つ。
   Root causeだけの修正では、伝播済みeffectへのobligationを免除しない。
5. `trigger`はphenomenonを表面化させたものを記録する。別の`root_cause` nodeとcausal relationを宣言
   しない限り、producing root causeにはならない。
6. `escape_cause`はdetection、review、monitoring、acceptanceがdefectを防げなかった理由を記録する。
   Producing-cause要求を満たさない。
7. `action_state=implemented`は実行だけを主張する。`action_state=effective`には、`result=passed`のlink済み
   verificationが1つ以上必要である。
8. Failedまたはinconclusive verificationではeffectivenessを未解決のままにし、`pending` itemまたは
   successor actionへlinkする。
9. Causal subgraphとimpact propagation subgraphはacyclicでなければならない。Cycleは構造errorであり、
   現実世界のanalysisが誤りであることの証明ではない。

## 7. 安定audit rule

Profileは少なくとも次の安定rule IDを定義する。Strict severityは規範的である。Guidedでは表に示す
場合だけerrorをwarningへ下げられる。Fatalなsyntax/profile/reference failureはGeneric V2が所有する。

| Rule ID      | 条件                                                                                    | Guided  | Strict |
| ------------ | --------------------------------------------------------------------------------------- | ------- | ------ |
| `RCA-R1-001` | phenomenonがactionへ接続されるがimpact scopeまたはproducing root-cause pathがない       | warning | error  |
| `RCA-R1-002` | caseにdocumented impact scopeがない                                                     | warning | error  |
| `RCA-R1-003` | in-scope targetにcurrent assessmentが正確に1つない                                      | warning | error  |
| `RCA-R1-004` | affected/unaffected assessmentにevidenceがない                                          | warning | error  |
| `RCA-R1-005` | root causeにevidenceまたは明示的evidence-producing operationがない                      | warning | error  |
| `RCA-R1-006` | settled caseにescape causeはあるがproducing root causeがない                            | error   | error  |
| `RCA-R1-007` | root causeにcorrective actionがない                                                     | warning | error  |
| `RCA-R1-008` | affected/suspectなdownstream targetにcontainment、recovery、pendingがない               | warning | error  |
| `RCA-R1-009` | scope completenessがpartial/unknownまたはassessmentがsuspect/unknownのままcaseがsettled | error   | error  |
| `RCA-R1-010` | passed verificationなしでactionがeffective                                              | error   | error  |
| `RCA-R1-011` | causalまたはimpact propagation graphにcycleがある                                       | error   | error  |
| `RCA-R1-012` | failed/inconclusive verificationにpendingまたはsuccessor actionがない                   | warning | error  |

各findingは最小の関係source-backed declarationをtargetとし、個別spanを持つ。欠落objectにspanがない場合、
findingは未達obligationを所有するdeclarationをtargetにし、欠落relation/kindをmetadataで識別する。

## 8. Completionとtruth境界

RCA caseが構造的に完了するのは、次をすべて満たす場合だけである。

- stateが`settled`
- 各phenomenonにdocumented complete impact scopeとproducing root causeがある
- 各in-scope targetに解決済みcurrent assessmentがある
- 必須evidence、corrective action、containment/recovery、verification pathがある
- blocking R1 findingが残っていない
- 必須obligationがunlinked `pending` nodeだけで表されていない

Structural completionを、factual correctness、external approval、correction deployment、現実世界でのaction
effectiveness、incident closure、recurrence preventionと表示してはならない。これらの主張にはLLMThink外の
evidenceとauthorityが必要である。

## 9. 必須executable fixture

R1は次の6 caseについてsourceと期待raw audit JSONを必要とする。

1. 完全なimpact-aware RCA: phenomenon、complete scope、realized/credible impact、unaffected target、root/
   escape cause、corrective action、containment、recovery、passed verificationを含む。
2. Phenomenonからcountermeasureへ直行: `RCA-R1-001`と関連するmissing-scope/cause ruleを出力する。
3. 不完全impact universe: 1つ以上のin-scope targetにassessmentがなく、completionをblockする。
4. Escape-cause substitution: producing root causeなしでreview/test omissionを使うと`RCA-R1-006`を出力する。
5. Downstream effect放置: cause correctionはあるがaffected targetにcontainment/recovery/pendingがなく、
   `RCA-R1-008`を出力する。
6. 未検証action effectiveness: passed verificationなしでimplemented actionをeffectiveと宣言すると
   `RCA-R1-010`を出力する。

Core、CLI raw JSON/text、stdio MCP、Hosted Application Service、LSP、VSIXは、presentation-only fieldを
除去した後、すべてのfixtureのrule ID、severity、target reference、span、message identityで一致する。

## 10. V1共存とmigration

1. `rca-impact@1.0.0`の追加または選択によって、V1文書または他profileを使うV2文書の意味やfindingを
   変更してはならない。
2. RCAらしいV1文書はV1文書のまま有効であり、暗黙にRCA R1へ再分類しない。
3. V1-to-RCA migrationは宣言されたproblem/evidence/decision/pending構造を保存できるが、proseから
   phenomenon、impact、target classification、root cause、trigger、escape cause、containment、recovery、
   verification、relation semanticsを推定してはならない。
4. 欠落したRCA固有meaningは、source-located migration questionまたはpending requirementとして報告する。
   Migration outputは推定roleからstructural completionを主張してはならない。
5. RCA profileのinstallまたはdocument checkだけでthought storeをmigrateしない。

## 11. Trustとoperation境界

- RCA auditは、supplied document、verified profile、Generic V2が許可する明示準備済みsemantic inputだけを読む。
- `target_ref`をfetchせず、repository、filesystem、runtime、deployment、credential authorityとして使わない。
- Profile ruleはcode、command、resolver、network request、repository inspectionを実行できない。
- AuditはIssue、file、plan、code、test、remote、deployment、thought storeを変更しない。
- Audit PASSはcorrective、containment、recovery、recurrence-prevention、verification actionを認可しない。

## 12. 受入基準

RCA Profile R1を受け入れられるのは次を満たす場合だけである。

1. 選択した3方式の組み合わせを記録し、RCA parser productionを追加しない。
2. 必須RCA kind、property、relationがGeneric V2を通じてlosslessにround-tripする。
3. affected/suspect/unaffected/unknown assessmentとcomplete/partial/unknown scopeが独立しquery可能である。
4. realized/credible impactが区別され、明示targetへlinkされる。
5. root、contributing、trigger、escape causeが構造的に区別される。
6. corrective action、containment、recovery、recurrence prevention、verificationが区別される。
7. 12の安定ruleが受入済みGeneric V2 closed constraint operatorだけを使う。
8. 6 fixtureすべてが全必須surfaceで正確な期待finding/spanを生成する。
9. 完全fixtureにはblocking R1 findingがなく、各不完全fixtureは無関係なrule noiseに埋もれず意図ruleで
   失敗する。
10. Profile追加が無関係なV1/V2 documentのfinding、AST、help default、storage、behaviorを暗黙変更しない。
11. 悪意あるtarget reference/profile propertyがI/Oまたはcode executionを引き起こせない。
12. MigrationがproseからRCA semanticsを推定せず、未解決roleをすべてlocation付きで報告する。
13. Audit PASSとcase `settled`をstructural conformanceとしてのみ提示する。
14. Implementation change setにrelease、publication、deployment、Issue mutation、external action、Generic V2
    acceptance、V1 cutoverを含めない。

## 13. 非目標

- cause、impact、classification、remedyのfactual truth判定
- semantic inspectionによりhuman、tool、LLM、test、review、monitor observationをroot causeとして扱うこと
- 実際のimpact universeの自動発見
- file、commit、requirement、plan、runtime state、remote、deploymentのfetch
- embeddingまたはproseからcausal/support/impact/containment/verification linkを生成すること
- RCA固有parser syntaxまたはexecutable audit pluginの追加
- V1 orphan、contradiction、semantic、finalize、thought-store behaviorの変更
- namespace、ACL、cross-thought resolution、release、publication、deployment、Issue mutation
- structural completionがincidentをcloseまたはaction effectivenessを証明するとの主張

## 14. 前提と未解決判断

- この候補は正確なGeneric V2 R1 predecessorが変更なしで受け入れられることを仮定する。そのbytesが
  変わった場合、本依存をreconcileし、本候補revisionを再reviewする。
- Profile JSON表現と正確なmessage textは後続artifactである。Rule ID、structural condition、severity、
  target、message identityは本書で固定する。
- Target universeの完全な内容はauthor-declaredのままとする。自動発見はR1外であり、別authorityを
  持つrepository/runtime integrationを必要とする可能性がある。
- Profile publication、package配置、release activation、operational incident workflowは別判断である。

## 15. Step 1自己レビュー

- Issue #44のfunctional outcomeを、phenomenon-to-remedyの直接checklistへ弱めず維持した。
- Root cause、contributing condition、trigger、escape causeを分離した。
- Source-cause correctionとpropagated-impact containment/recoveryを分離した。
- 選択したgeneric/profile/declarative-auditの組み合わせを明示し、候補を黙って統合していない。
- Structural auditをtruth judgment、implicit I/O、action authorityから分離した。
- V1と無関係なV2 profileに影響しない。
- この候補はGeneric V2/RCA R1を受け入れず、design、ADR作成、implementation、migration、external action、
  release、deploymentを認可しない。
