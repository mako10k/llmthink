# 独立レビュー入力: Impact-Aware RCA Profile R1 要求リビジョンR2 日本語全文訳

本書は `rca-profile-r1-r2.review.md` のレビュー支援用日本語訳であり、正本ではない。

状態: Step 3向け入力案、Step 2のオーナーrouteは未選択

候補: `docs/requirements/rca-profile-r1-r2.md`

候補digest: `sha256:23d2b0b7b765112dd309b327dacce65119660c845ef2c8e422f04b968ef23d61`

日本語レビュー支援: `docs/requirements/rca-profile-r1-r2.ja.md`

日本語訳digest: `sha256:edbdeeba0dd53b92ca05ea7ed0b3a94f79fde85a878b1d65cd90e2d103ec7e14`

## レビューauthorityと依存関係

上記の正確な候補bytesだけをレビューする。候補を編集せず、review findingを新しい要求に変えない。
候補はGeneric Profile and Audit Contract V2 R2候補
`sha256:89f20a526d4bf67df4c9576b529d3e8b13a617218935d12551fc2e3f0b9e8cc8`に依存する。
そのpredecessorが未受入、reconcileなしに変更済み、またはRCA constraintを表現不能と判明した場合、
本候補を受け入れられない。

各重要findingを、contradiction、evidence gap/unresolved unknown、optional/future candidate、out of scopeの
いずれかへ分類する。Severityは分類を変えない。Reviewはどちらの要求も受け入れず、design、実装、
migration、external action、release、deploymentを認可しない。

## Source provenanceと選択した組み合わせ

候補はIssue #44の現行本文を固定し、Issues #10/#25をgeneric profile routeに、Issue #43をaudit境界の
証拠だけに使用し、正確なGeneric V2 predecessorへbindingする。3候補が忠実に表現されているか確認する。

- RCA固有parser syntaxなし
- Generic V2 primitiveと`rca-impact@1.0.0`
- Declarative closed profile constraintだけによるRCA固有audit

## Scope内

- 区別されたRCA case、phenomenon、impact universe、target、assessment、impact、cause、action、
  verification、evidence、pending構造
- affected/suspect/unaffected/unknownの明示target assessment
- 列挙impact数とは別のscope completeness
- realized impactとcredible impact
- root、contributing、trigger、escape causeの分離
- corrective action、containment、recovery、recurrence prevention、verificationの分離
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

17項目の受入section全体をreviewし、特に次を確認する。

1. Generic closed operatorがhidden codeなしで12のRCA ruleすべてを表現できるか。
2. Scope/target/assessment modelがuniverse completenessとassessment outcomeを区別できるか。
3. Source cause、contributing condition、trigger、escape causeが相互代用できないか。
4. Root-cause correctionが伝播済みeffectのcontainment/recovery obligationを免除しないか。
5. Implemented/effective actionとpassed/failed/inconclusive verification transitionが一貫するか。
6. 6 fixtureが無関係なdiagnostic noiseなしで意図した安定ruleを分離するか。
7. Target referenceがopaqueのままで、I/Oまたはrepository/runtime authorityを付与しないか。
8. V1と無関係なV2文書が変更されないか。
9. RCA固有parser/dispatch codeなしで、全RCA help routeとaliasがgeneric profile registryから導出されるか。
10. 各表示exampleが正確なprofile referenceでparse/auditでき、宣言済みstable findingだけを生成し、invalid
    routeがofflineで回復できるか。

## 既知のunknown

- Generic V2 predecessorは候補であり、未受入である。
- 正確なprofile JSONと最終message textは後続artifactである一方、rule ID、condition、severity、target、
  message identityは本候補で固定される。
- 現実世界の実際のimpact universeはauthor-declaredのままである。
- Profile publication、package配置、operational integration、releaseは未決定である。
- 正確なCLI引数順序はGeneric V2の後続design判断である。

## レビュー質問

1. `rca-impact@1.0.0`はparser syntaxを追加せずIssue #44の全要素を表現できるか。
2. `impact_scope`、`impact_target`、`impact_assessment`、`impact`は、少数のimpact listをcomplete universeと
   誤認することを防ぐのに十分区別されているか。
3. Relation方向はcausal、propagation、support、action、verification queryをlosslessに支えるか。
4. `RCA-R1-001`から`RCA-R1-012`はtruthを主張せず、意図したstructural gapを検出するか。
5. Structural completion contractはpartial/unknown scope、unresolved assessment、missing containment/recovery、
   unverified effectivenessをblockするのに十分厳格か。
6. MigrationはV1 proseからのunsupported inferenceをすべて避けるか。
7. 必須findingをすべて最小のsource-backed spanへtargetできるか。
8. Generic V2を黙って拡張、V1を変更、external actionを認可する条項がないか。
9. Help indexは、guidanceをtruth、completion、operational authorityとして提示せず、順序付きRCA workflowと
   全必須structural categoryを扱うか。
10. Route/example基準はV1 helpを維持しながら、全必須surfaceで完全、決定論的、offlineなnavigationを
    実証するか。

## 独立レビュー後のroute

この入力を使用する前に、Step 2でオーナーが次のいずれかを選択する。

- `REVIEW_THEN_REVISE`: 変更されていないsnapshotをreviewし、Step 1へ戻る。
- `REVIEW_THEN_DECIDE`: 変更されていないsnapshotをreviewし、Step 4で候補とreportを提示する。

代わりにオーナーは、独立レビューを省く`REVISE`、または追加質問なしの`REVIEW`を選べる。本書から
routeを推定しない。
