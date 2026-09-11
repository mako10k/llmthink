# V2 R1 要求レビュー lifecycle

状態: Step 1完了、Step 2オーナーレビュー待ち  
作成日: 2026-09-11  
基準main: `8cce0d9812f4d1841e2c26c96c29ed6982bb34c9`

## Snapshot一覧

| Role                               | Path                                                   | SHA-256                                                            |
| ---------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------ |
| Generic V2英語正本候補             | `docs/requirements/generic-profile-v2-r1.md`           | `7312ae5904d36e60f11e67c414d3d7c2fee19ef8a2e789a51115b197603c736b` |
| Generic V2日本語全文訳             | `docs/requirements/generic-profile-v2-r1.ja.md`        | `8ad57b94819564f02cdc59dc79785c7a9e17f848a74e7d6163aa1980aa2d3cb9` |
| Generic V2独立レビュー入力         | `docs/requirements/generic-profile-v2-r1.review.md`    | `a45d79e357020bbed48d9bb3669ea916a0a0374fa105956fa0b7153a115d9ca5` |
| Generic V2レビュー入力日本語全文訳 | `docs/requirements/generic-profile-v2-r1.review.ja.md` | `bd6856469930c10899a38fc5c9b04a96712e6acb0e0b3eb3ba562b1185e96086` |
| RCA R1英語正本候補                 | `docs/requirements/rca-profile-r1.md`                  | `aff936dde5f95cabc7302728b1da9db15409f42acf575cf5e196798dd3a4364b` |
| RCA R1日本語全文訳                 | `docs/requirements/rca-profile-r1.ja.md`               | `b2d90b20e7dadb6d450a6798cff1ecbbe396fabd7259fb27208f69b509ce1d22` |
| RCA R1独立レビュー入力             | `docs/requirements/rca-profile-r1.review.md`           | `a55eaaa547b344a11895d71a6224e7d176ad9f180eb9f16003a5a748acc5c709` |
| RCA R1レビュー入力日本語全文訳     | `docs/requirements/rca-profile-r1.review.ja.md`        | `4dcc3a0df28f31ff3b480ee55aea72a4a84c896ea4aab5a10ba6aa9fdeceb594` |

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
