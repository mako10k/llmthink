# 独立レビュー入力: Impact-Aware RCA Profile R1 要求リビジョンR4 日本語全文訳

本書は`rca-profile-r1-r4.review.md`のレビュー支援用日本語全文訳であり、正本ではない。

状態: 承認済みStep 3入力

First-owner route: `REVIEW_THEN_DECIDE`

オーナー追加質問: なし

候補: `docs/requirements/rca-profile-r1-r4.md`

候補digest: `sha256:890bf0c0cd1b704e7c2822299e46ce39750b7751e1132050818be0ff43ebc90f`

日本語レビュー支援: `docs/requirements/rca-profile-r1-r4.ja.md`

日本語訳digest: `sha256:6f1f653cf18dcf2cfb511a4d8030ef45370d10c57062aef3ebaf64800dd4a47e`

## レビューauthorityと依存関係

上記の正確な候補bytesだけをレビューする。候補を編集せず、review findingを新しい要求に変えない。
候補は、受入済みGeneric Profile and Audit Contract V2 R2 snapshot
`sha256:89f20a526d4bf67df4c9576b529d3e8b13a617218935d12551fc2e3f0b9e8cc8`に依存する。
そのpredecessorがreconcileなしに変更された場合、またはR4が受入済みclosed set外のconstraint operatorを
黙って要求する場合、本候補を受け入れられない。

各重要findingをcontradiction、evidence gap/unresolved unknown、optional/future candidate、out of scopeの
いずれかへ分類する。Severityは分類を変えない。ReviewはRCA要求を受け入れず、design、implementation、
migration、external action、release、deploymentを認可しない。

## Revision contextとsource provenance

オーナーは完了済み独立レビュー後にR3を改訂へ返した。R4は新しいStep 1 snapshotであり、R3 review statusを
引き継がない。受入済みGeneric contractを変更せず、Issue #44を弱めず、R4が次のR3 findingを解消するか確認する。

- 正確なtarget-to-target relationで下流成果物dependency/propagationを表現する。
- Required actionがnon-effectiveまたは未検証のままsettled completionになることを拒否する。
- Follow-up actionのdistinctnessとlogical orderingを定義する。
- 相関するclosed-operator評価を明示的なcapability proof gateとして維持する。

候補はIssue #44の現行本文を固定し、Issues #10/#25をgeneric profile routeに、Issue #43をaudit境界の
証拠だけに使用し、受入済みGeneric V2 predecessorへbindingし、R2/R3レビュー報告を非規範revision evidence
としてのみ参照する。

## Scope内

- R3の完全なRCA structural modelと先行4修正
- same-case impact target間で方向の異なる`depends_on`と`propagates_to_target`
- downstream target chainのscope closureとrelation別acyclicity
- current pending nodeとnon-effective/未検証required actionを持つsettled caseの拒否
- failed/inconclusive verification後のdistinct-node follow-upとwall-clock time非推定
- 正確なtarget/span/discipline severityを持つ13 stable structural rule
- 8 executable fixtureとsurface横断conformance
- 相関ruleが受入済みclosed operatorだけを使うことを示す正確な最小profile-fragment proof
- profile registryから導出するRCA help、V1共存、fail-closed migration、trust境界
- implicit I/O、semantic truth judgment、action authorityの禁止

## Scope外

- factual cause、impact、classification、propagation、effectivenessの判断
- 現実のimpact universeの自動発見またはfetch
- prose/embeddingからのRCA role、relation、dependency、propagation、time推定
- 新しいGeneric V2 operator、RCA固有parser production、executable profile plugin
- V1 behavior変更、namespace/cross-thought work、operational incident workflow、external action、release、
  publication、deployment、Issue mutation

## 受入観点

22項目のcapability受入section全体をreviewし、特に次を確認する。

1. 両downstream target relationが、曖昧でない逆方向、same-case endpoint、scopeごとのclosure、relationごとの
   cycle rule、通常のGeneric DSLQL traversalを持つか。
2. Settled caseがcurrent pending nodeを含めず、`corrects`、`contains`、`recovers`、`prevents`で
   non-effective/未検証actionを使えないか。
3. Failed/inconclusive verificationがpendingまたはdistinct follow-up nodeを要求し、推定timeなしにrelationだけが
   logical successionを与えるか。
4. 13 stable ruleの各々が受入済みclosed operatorへmapされ、最小source-backed targetを持つか。
5. 最小profile-fragment proofがcapability gateであり、Generic operator追加またはhidden code許容を黙って
   行わないか。
6. 8 fixtureが無関係なdiagnostic noiseなしで意図findingを分離するか。
7. Issue #44のdownstream-artifact/unverified-completion exampleがlosslessに網羅されたか。
8. Target referenceがopaqueのままで、I/Oまたはrepository/runtime authorityを付与しないか。
9. 全RCA help route、alias、stable-rule detail、exampleがregistry-derived、deterministic、offlineのままか。
10. V1と無関係なV2 documentが変更されないか。

## 既知のunknown

- 正確なprofile JSONと最終message textは後続artifactである。
- 最小closed-operator profile fragmentとexecutable fixtureはまだ存在しない。R4は成功を仮定せず、これらを
  capability-acceptance evidenceとする。
- 現実世界の実際のimpact universeはauthor-declaredのままである。
- Profile publication、package配置、operational integration、releaseは未決定である。
- 正確なCLI引数順序はGeneric V2の後続design判断のままである。
- R4はまだ独立レビューもオーナー受入も受けていない。

## レビュー質問

1. R4はGeneric V2を拡張せず、R3の2 contradictionと2 evidence gapをすべて扱っているか。
2. Downstream requirement/design/plan/implementation chainを、dependency/propagation両方向で混同せず表現・
   queryできるか。
3. Scope closureは、宣言済みdownstream relationが未assessment endpointをuniverse外へ隠すことを防ぐか。
4. `RCA-R1-010`はeffective-without-verificationとsettled-with-implemented-only actionの両方を拒否するか。
5. `RCA-R1-009`とcompletion contractは、未解決pending obligationをsettledに見せない点で一貫するか。
6. 各follow-up actionはfailed/inconclusive verificationが評価した全actionと構造的にdistinctで、未対応の
   temporal claimがないか。
7. 13 stable ruleすべてが受入済みclosed operatorで表現可能と合理的に見込め、proof failure時にGeneric
   contract reconciliationへ戻る経路が正しいか。
8. 8 fixtureは元のIssue #44の6 exampleを維持しながら、新relation/completion ruleを網羅するか。
9. V1の黙示変更、truth judgment/I/Oの認可、external effectの本要求reviewへの取り込みがないか。
10. Help/migration基準がcomplete、deterministic、offline、non-inferentialのままか。

## 独立レビュー後のroute

オーナーはStep 2で`REVIEW_THEN_DECIDE`を選択した。変更されていないsnapshotをreviewした後、completedまたは
not-reviewable reportとともにStep 4のオーナー判断へ提示する。このrouteは`ACCEPT`、`REVISE`、`REREVIEW`の
いずれも事前決定しない。
