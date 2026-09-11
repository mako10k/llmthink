# 独立レビュー入力: Generic Profile and Audit Contract V2 R2 日本語全文訳

本書は `generic-profile-v2-r2.review.md` のレビュー支援用日本語訳であり、正本ではない。

状態: Step 3向け入力案、Step 2のオーナーrouteは未選択

候補: `docs/requirements/generic-profile-v2-r2.md`

候補digest: `sha256:89f20a526d4bf67df4c9576b529d3e8b13a617218935d12551fc2e3f0b9e8cc8`

日本語レビュー支援: `docs/requirements/generic-profile-v2-r2.ja.md`

日本語訳digest: `sha256:6580485352866554ac6130e43f630310902c2e4019c99de592315d4ea24bcc95`

## レビューauthority

上記で識別された正確な候補bytesだけをレビューする。候補を編集せず、review findingを要求textとして
扱わない。重要なfindingを次のいずれかへ分類する。

- 候補またはauthoritative sourceとの矛盾
- evidence gapまたは未解決unknown
- optionalまたはfuture candidate
- out of scope

Severityはその分類内での影響を表す。レビュー完了は要求を受け入れず、ADR、実装、migration、release、
deployment、Issue mutationを認可しない。

## Source provenanceと既存authorityの扱い

候補は、オーナーの共存方針、Issues #10/#25/#43、現行V1 requirements、ADRs
0018/0019/0021/0023、reconcile済みV1 audit baseline、受入済みPERT順序の正確なsnapshotを固定している。
次を正しく実現しているかレビューする。

1. V1を既定のまま維持し、現行V1動作を保存しているか。
2. Issue #25の破壊的単純化を、明示選択されたV2文書の内部に限定しているか。
3. Hosted MCP V1、root compatibility、ADR-0023の撤回判断を維持しているか。
4. 現行実装を実現可能性の証拠としてのみ扱っているか。
5. namespace/cross-thought workを拒否もR1 blocker化もせず、将来拡張として保存しているか。

## Scope内

- 明示的なV2 grammar/profile選択
- 汎用declaration/link/operation/query grammarとnormalized IR
- 不変profile identity、version、RFC 8785 digest、manifest binding
- closed declarative constraint vocabularyと非実行profile境界
- discipline動作、安定finding、target span、lossless raw report
- current-document限定のread-only DSLQL
- 明示的、決定論的、fail-closedなV1 document migration
- 1つのregistryによる明示的なprofile-aware help navigation、V1既定の維持、offlineなfailure/recovery動作、
  実行可能example
- V1共存と、暗黙source/store/public-surface変更の禁止
- trust、resource limit、failure semantics
- surface横断の構造conformance基準

## Scope外

- V1 cutover、deprecation、removal
- namespace/ACL/OAuth/cross-thought loadingとHosted ScopeExpr
- truth、evidence strength、causal validity、goal achievement、semantic relation推定
- 実行可能またはremote loadされるprofile
- thought-store migrationの実行
- Hosted MCP V1またはroot compatibility変更
- specialized profileの受入
- release、publication、deployment、production activation、Issue mutation

## 受入観点

独立レビューは21項目の受入section全体を検査し、特に次を確認する。

- V1とV2のdispatchが一意であること
- parserやCore IRを変更せず新profileを追加できること
- closed operatorがhidden codeなしで必要なstructural profileを表現できること
- digest/version failureがfail closedであること
- V1 migrationが決定論的、非変更、loss-awareであること
- raw findingが全adapterで安定identityとtarget別spanを保持すること
- 全登録help route、alias、exampleが、use-case固有parser/dispatch分岐なしでsurface間において完全かつ
  一貫していること
- 除外したnamespace/release/cutover workがR1完了条件に実際に含まれないこと

## 既知のunknown

- 正確なprofile JSON Schemaとpackage配置は後続design artifactである。
- 最初の同梱`reasoning@2.0.0` profile bytesとdigestはまだ存在しない。
- 正確なCLI引数順序とhelp registryの物理表現は後続design判断である。
- Namespace-aware queryとcross-thought referenceは将来要求判断のままである。
- V2 release、activation、V1 retirement pathは未決定である。

## レビュー質問

1. `think <profile>@<version>` headerは、すべての現行headerless/V1 source pathを維持しながら、V2を
   一意に選択できるか。
2. Profile referenceとRFC 8785 digest contractは、暗黙profile driftを防げるか。
3. Closed constraint vocabularyは、実行可能profile logicを許さずgeneric graph/profile validationを
   表現するのに十分か。
4. Discipline別severityがsyntax、identity、reference、integrity failureを弱めないか。
5. Migrationはすべての公式V1 exampleを保存できるか、または正確なlocationとreason付きで失敗し、
   暗黙source/thought-store writeを行わないか。
6. Report/conformance基準は、Core、CLI、MCP、LSP、VSIX間でlossless raw dataと同一structural findingを
   維持するか。
7. R1 scopeは、将来のprepared-runtime境界を維持しながらnamespace/authorization workを正しく分離
   しているか。
8. 受入済みV1、Hosted、public name、semantic-audit authorityを黙って変更する条項がないか。
9. Help navigationは明示的にV2/profileを選択し、決定論的かつofflineで、use caseごとの重複ではなく同じ
   検証済みprofile identityから生成されるか。
10. 全route/example検査基準は、topic欠落、壊れたalias、未記載fallback、表示profileでparse/auditできない
    exampleを防ぐか。

## 独立レビュー後のroute

この入力を使用する前に、Step 2でオーナーが次のいずれかを選択する。

- `REVIEW_THEN_REVISE`: 変更されていないsnapshotをreviewし、Step 1へ戻る。
- `REVIEW_THEN_DECIDE`: 変更されていないsnapshotをreviewし、Step 4で候補とreportを提示する。

代わりにオーナーは、独立レビューを省く`REVISE`、または追加質問なしの`REVIEW`を選べる。本書から
routeを推定しない。
