# 独立レビュー入力: Impact-Aware RCA Profile R1 要求リビジョンR3 日本語全文訳

本書は `rca-profile-r1-r3.review.md` のレビュー支援用日本語訳であり、正本ではない。

状態: Step 3向け入力案、Step 2のオーナーrouteは未選択

候補: `docs/requirements/rca-profile-r1-r3.md`

候補digest: `sha256:6f3817a9285d7cbea6b7981977e8765a5a31060205f91fa15d464b008c132312`

日本語レビュー支援: `docs/requirements/rca-profile-r1-r3.ja.md`

日本語訳digest: `sha256:4c98a592c5f72f8d9bfc34dca3650a51c942f2427ad434247673080e8e9a2613`

## レビューauthorityと依存関係

上記の正確な候補bytesだけをレビューする。候補を編集せず、review findingを新しい要求に変えない。
候補は、受入済みGeneric Profile and Audit Contract V2 R2 snapshot
`sha256:89f20a526d4bf67df4c9576b529d3e8b13a617218935d12551fc2e3f0b9e8cc8`に依存する。
そのpredecessorがreconcileなしに変更された場合、またはRCA constraintを表現不能と判明した場合、
本候補を受け入れられない。

各重要findingをcontradiction、evidence gap/unresolved unknown、optional/future candidate、out of scopeの
いずれかへ分類する。Severityは分類を変えない。ReviewはRCA要求を受け入れず、design、実装、migration、
external action、release、deploymentを認可しない。

## Revision contextとsource provenance

オーナーはGeneric V2 R2を受け入れ、独立レビュー後にRCA R2候補を改訂へ返した。R3は新しいStep 1
snapshotであり、R2 review statusを引き継がない。RCA固有parser syntax、executable profile behavior、
または明記されていないGeneric V2拡張を追加せず、R3が次のR2 finding 4件を解消したか確認する。

- failedまたはinconclusive verificationのfollow-upを`requires_followup`で表現する。
- impact obligationをimpact-to-targetとcurrent-assessment構造だけで表現する。
- 各phenomenonを`covered_by`で正確に1つのsame-case impact scopeへbindする。
- relation endpointのcategory shorthandを正確なnode-kind集合へ置換する。

候補はIssue #44の現行本文を固定し、Issues #10/#25をgeneric profile routeに、Issue #43をaudit境界の
証拠だけに使用し、受入済みGeneric V2 predecessorへbindingし、R2レビュー報告を規範textではなくrevision
evidenceとして参照する。

## Scope内

- 区別されたRCA case、phenomenon、impact universe、target、assessment、impact、cause、action、
  verification、evidence、pending構造
- 各phenomenonに正確に1つのsame-case `covered_by` scope
- affected/suspect/unaffected/unknownの明示target assessment
- 正確なimpact-to-in-scope-targetとassessmentの整合性
- realized impactとcredible impact
- root、contributing、trigger、escape causeの分離
- corrective action、containment、recovery、recurrence prevention、verificationの分離
- `tracks`または`requires_followup`によるfailed/inconclusive verification follow-upの表現可能性
- 全relationの正確なendpoint kind
- target spanとdiscipline severityを持つ12の安定structural rule
- 6つの実行可能なpositive/negative fixtureとsurface横断conformance
- profile registryから導出され、workflow、structural model、rule、fixture、migration、制限を扱うRCA help
- V1共存とfail-closed、非推定migration
- implicit I/O、semantic truth judgment、action authorityの禁止

## Scope外

- factual cause、impact、classification、effectivenessの判断
- 現実のimpact universeの自動発見またはfetch
- prose/embeddingからのRCA role/relation推定
- RCA固有parser productionまたはexecutable profile plugin
- V1 behavior変更、namespace/cross-thought work、operational incident workflow、external action、release、
  publication、deployment、Issue mutation

## 受入観点

19項目の受入section全体をreviewし、特に次を確認する。

1. 受入済みgeneric closed operatorがhidden codeなしで12のRCA ruleすべてを表現できるか。
2. 各phenomenonが正確に1つのsame-case scopeを持ち、各impact-to-target claimがそのscopeとtargetのcurrent
   assessmentに対して検査されるか。
3. Realized/credible impactが一貫した許可assessmentを持ち、current `affected` assessmentからrealized
   impactへのreverse obligationも含むか。
4. Source cause、contributing condition、trigger、escape causeが相互代用できないか。
5. Root-cause correctionが、applied impactを持つaffected/suspect targetのcontainment/recovery obligationを
   免除しないか。
6. Failed/inconclusive verificationが正確な`tracks`または`requires_followup` endpointを通じて表現可能な
   successor obligationを持つか。
7. 全relation endpoint集合とmissing-obligation target ruleが機械的に判定可能か。
8. 6 fixtureが無関係なdiagnostic noiseなしで意図した安定ruleを分離するか。
9. Target referenceがopaqueのままで、I/Oまたはrepository/runtime authorityを付与しないか。
10. RCA固有parser/dispatch codeなしで、全RCA help routeとaliasがgeneric profile registryから導出されるか。
11. 各表示exampleが正確なprofile referenceでparse/auditでき、宣言済みstable findingだけを生成し、invalid
    routeがofflineで回復できるか。
12. V1と無関係なV2文書が変更されないか。

## 既知のunknown

- 正確なprofile JSONと最終message textは後続artifactである一方、rule ID、condition、severity、target、
  message identityは本候補で固定される。
- 現実世界の実際のimpact universeはauthor-declaredのままである。
- Profile publication、package配置、operational integration、releaseは未決定である。
- 正確なCLI引数順序はGeneric V2の後続design判断である。
- R3はまだ独立レビューもオーナー受入も受けていない。

## レビュー質問

1. R3は、未対応要求を追加せず、各R2 contradiction/evidence gapを解消しているか。
2. `rca-impact@1.0.0`はparser syntaxを追加せずIssue #44の全要素を表現できるか。
3. `covered_by`は各phenomenonを正確に1つのsame-case impact universeへ曖昧さなく関連付けるか。
4. `impact_scope`、`impact_target`、`impact_assessment`、`impact`は十分区別され、forward/reverseの
   consistency obligationがすべて明示されているか。
5. 全relationのendpoint kindがdeclarative validation/queryに十分正確か。
6. Failed/inconclusive verificationはsuccessor actionをeffectiveと装わず、未解決obligationを常に
   表現できるか。
7. `RCA-R1-001`から`RCA-R1-012`はtruthを主張せず、意図したstructural gapを検出するか。
8. Structural completion contractはpartial/unknown scope、unresolved assessment、missing
   containment/recovery、unverified effectivenessをblockするのに十分厳格か。
9. MigrationはV1 proseからのunsupported inferenceをすべて避けるか。
10. 必須findingをすべて最小のsource-backed spanへtargetできるか。
11. Generic V2を黙って拡張、V1を変更、external actionを認可する条項がないか。
12. Help route/example基準はV1 helpを維持しながら、全必須surfaceで完全、決定論的、offlineなnavigationを
    実証するか。

## 独立レビュー後のroute

この入力を使用する前に、Step 2でオーナーが次のいずれかを選択する。

- `REVIEW_THEN_REVISE`: 変更されていないsnapshotをreviewし、Step 1へ戻る。
- `REVIEW_THEN_DECIDE`: 変更されていないsnapshotをreviewし、Step 4で候補とreportを提示する。

代わりにオーナーは、独立レビューを省く`REVISE`、または追加質問なしの`REVIEW`を選べる。本書から
routeを推定しない。
