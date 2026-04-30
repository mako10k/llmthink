# DSL サンプル集

本ファイルは、思考記述 DSL の最小サンプルを集めたものである。

## 1. 問題定義と判断

```dsl
framework DecisionAudit

domain Hiring:
  description "採用方針の検討"

problem P1:
  "バックエンド採用を急ぐべきか"

step S1:
  premise PR1:
    "現在の開発速度はチームのボトルネックである"

step S2:
  evidence EV1:
    "バックログの消化速度が3スプリント連続で低下している"

step S3:
  decision D1 based_on PR1, EV1:
    "バックエンド採用を優先する"
```

このサンプルが示すこと。

- problem、premise、evidence、decision の最短接続
- decision が単独では成立せず、参照を必要とすること

## 2. MECE 分解と Others

```dsl
framework PartitionAudit

domain SupportTickets:
  description "問い合わせの分類"

problem P1:
  "問い合わせを一次分類する"

step S1:
  viewpoint VP1:
    axis cause_type

step S2:
  partition PT1 on SupportTickets axis cause_type:
    A := billing_issue
    B := product_bug
    Others := not A and not B
```

このサンプルが示すこと。

- partition は domain と axis を必須にすること
- Others は補集合として書けるが、被覆性は監査対象になること

## 3. 矛盾候補と保留

```dsl
framework DecisionAudit

domain VendorSelection:
  description "ベンダ選定"

problem P1:
  "A社とB社のどちらを採用するか"

step S1:
  premise PR1:
    "運用コストを優先する"

step S2:
  evidence EV1:
    "A社は初期費用が低い"

step S3:
  decision D1 based_on PR1, EV1:
    "A社を採用する"

step S4:
  decision D2:
    "B社はコスト面で優位である"

step S5:
  pending PD1:
    "運用コストの試算はまだ未完了"
```

想定監査ポイント。

- D2 は根拠なしなので contract_violation
- D1 と D2 は contradiction_candidate になりうる
- PD1 があるため、結論確定の強さは下がる

## 4. query を含む補助評価

```dsl
framework ReviewAudit

domain DesignReview:
  description "設計レビュー論点"

problem P1:
  "監査結果に関連する判断を洗い出す"

step S1:
  decision D1 based_on EV1:
    "ADR を先に確定する"

query Q1:
  related_decisions(P1)
```

このサンプルが示すこと。

- query は監査の主機能ではないこと
- query_result は hint として返ること

## 5. フレームワーク宣言の骨格

```dsl
framework DecisionAudit:
  requires problem
  requires premise or evidence
  requires decision
  forbids decision_without_reference
  warns pending_after_strong_decision
```

このサンプルが示すこと。

- DSL が単なる記述ではなく、思考フレームワークの契約も持つこと
- 監査エンジンが framework 契約違反を検出する前提を表せること