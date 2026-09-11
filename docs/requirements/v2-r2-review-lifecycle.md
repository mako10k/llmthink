# V2 R2 要求レビュー lifecycle

状態: Step 1完了、Step 2オーナーレビュー待ち

作成日: 2026-09-11

基準main: `8cce0d9812f4d1841e2c26c96c29ed6982bb34c9`

## Snapshot一覧

| Role                               | Path                                                   | SHA-256                                                            |
| ---------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------ |
| Generic V2英語正本候補             | `docs/requirements/generic-profile-v2-r2.md`           | `89f20a526d4bf67df4c9576b529d3e8b13a617218935d12551fc2e3f0b9e8cc8` |
| Generic V2日本語全文訳             | `docs/requirements/generic-profile-v2-r2.ja.md`        | `6580485352866554ac6130e43f630310902c2e4019c99de592315d4ea24bcc95` |
| Generic V2独立レビュー入力         | `docs/requirements/generic-profile-v2-r2.review.md`    | `863a06db1a9b9aacb56433f1adcad865d73a0def2e7630fdafc08603ca517df0` |
| Generic V2レビュー入力日本語全文訳 | `docs/requirements/generic-profile-v2-r2.review.ja.md` | `d8a58f256a541c494a14daa8fbc37a248305d47f51286b399ad367523df0dd71` |
| RCA R1英語正本候補                 | `docs/requirements/rca-profile-r1-r2.md`               | `23d2b0b7b765112dd309b327dacce65119660c845ef2c8e422f04b968ef23d61` |
| RCA R1日本語全文訳                 | `docs/requirements/rca-profile-r1-r2.ja.md`            | `edbdeeba0dd53b92ca05ea7ed0b3a94f79fde85a878b1d65cd90e2d103ec7e14` |
| RCA R1独立レビュー入力             | `docs/requirements/rca-profile-r1-r2.review.md`        | `7c06a1f558d31a0588f5c971581285c1346cc42285f50de881399498a437dc1d` |
| RCA R1レビュー入力日本語全文訳     | `docs/requirements/rca-profile-r1-r2.review.ja.md`     | `702d6956f44484d3c502be4b653f1bf5d9c41b0d78ce1043021ac0e23e5015c6` |

## Step 1確認結果

- オーナー要求によりヘルプナビゲーションを追加したため、旧R1 snapshotをレビュー対象にせず、要求revision
  R2としてStep 1を再実施した。
- Generic V2とRCA R1を別候補、別digest、別レビュー入力として分離した。
- V1を既定のまま維持し、V2は`think <profile>@<version>`による明示選択とした。
- Issue #25のnamespace/cross-thought部分は将来候補として保全し、今回R2の受入blockerから分離した。
- Profile制約をclosed declarative operatorへ限定し、code、network、filesystem、store accessを禁止した。
- RCAでroot/contributing/trigger/escape causeと、corrective/containment/recovery/recurrence preventionを分離した。
- 影響universeのcompletenessと各targetのassessmentを別の構造として定義した。
- V2 helpは既存の段階的help graphとprofile registryを組み合わせ、V1既定を維持し、profile固有parser分岐を
  禁止した。
- Helpの全topic/detail/alias/example、invalid route回復、offline動作、surface横断identityを受入基準へ追加した。
- RCA helpはworkflow、構造category、12 rule、fixture、migration、制限を網羅し、truth判断やaction authorityを
  付与しない。
- 候補本文変更時はdigestを更新し、Step 1から再開する。
- 現時点ではどちらの候補も未受入であり、設計、ADR、実装、migration、release、deploymentを認可しない。

## 次のgate

オーナーは各候補について、次のいずれかを明示的に選択する。

- `REVISE`
- `REVIEW_THEN_REVISE`
- `REVIEW_THEN_DECIDE`
- `REVIEW`

追加のレビュー質問がある場合は、候補本文ではなく該当review inputへ追加してから独立レビューへ渡す。
