# V2 R1 要求レビュー lifecycle

状態: Step 1完了、Step 2オーナーレビュー待ち

作成日: 2026-09-11

基準main: `8cce0d9812f4d1841e2c26c96c29ed6982bb34c9`

## Snapshot一覧

| Role                               | Path                                                   | SHA-256                                                            |
| ---------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------ |
| Generic V2英語正本候補             | `docs/requirements/generic-profile-v2-r1.md`           | `9628bce445371304b1fd23e9521b1d53e8eb5f445dfdff15f601bf7225c20c54` |
| Generic V2日本語全文訳             | `docs/requirements/generic-profile-v2-r1.ja.md`        | `cbadd3185e70526e4702a648ea402dca26d260960aa518f9d0825a8a0dbc8c8a` |
| Generic V2独立レビュー入力         | `docs/requirements/generic-profile-v2-r1.review.md`    | `15dd7194de782e001676711474f1152a73eb9e54d016b096024b0d5f2eb44688` |
| Generic V2レビュー入力日本語全文訳 | `docs/requirements/generic-profile-v2-r1.review.ja.md` | `837812b9f7f5d877ee08c3415474ec453ce25386903bd197965e84cc94adb774` |
| RCA R1英語正本候補                 | `docs/requirements/rca-profile-r1.md`                  | `54e4d4532d11140e112fcd5e8855a32ffbc0f9b74d244eae10b2f94a2d199edc` |
| RCA R1日本語全文訳                 | `docs/requirements/rca-profile-r1.ja.md`               | `6f1e50fd9e79b7bac37c785abc03d74434cd62468169a05ef05875c417277c05` |
| RCA R1独立レビュー入力             | `docs/requirements/rca-profile-r1.review.md`           | `8825cf9ba0aca6e708a64a21c2115de4bb3659b2f15065285a8ecae4cc456883` |
| RCA R1レビュー入力日本語全文訳     | `docs/requirements/rca-profile-r1.review.ja.md`        | `6b3e3321cbc907f29547dd59a88e3a2524f52c5ef5f605f8e7747e09f0407f4a` |

## Step 1確認結果

- Generic V2とRCA R1を別候補、別digest、別レビュー入力として分離した。
- V1を既定のまま維持し、V2は`think <profile>@<version>`による明示選択とした。
- Issue #25のnamespace/cross-thought部分は将来候補として保全し、今回R1の受入blockerから分離した。
- Profile制約をclosed declarative operatorへ限定し、code、network、filesystem、store accessを禁止した。
- RCAでroot/contributing/trigger/escape causeと、corrective/containment/recovery/recurrence preventionを分離した。
- 影響universeのcompletenessと各targetのassessmentを別の構造として定義した。
- 候補本文変更時はdigestを更新し、Step 1から再開する。
- 現時点ではどちらの候補も未受入であり、設計、ADR、実装、migration、release、deploymentを認可しない。

## 次のgate

オーナーは各候補について、次のいずれかを明示的に選択する。

- `REVISE`
- `REVIEW_THEN_REVISE`
- `REVIEW_THEN_DECIDE`
- `REVIEW`

追加のレビュー質問がある場合は、候補本文ではなく該当review inputへ追加してから独立レビューへ渡す。
