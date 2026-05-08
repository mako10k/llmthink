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
  decision D1 based_on P1, PR1, EV1:
    "バックエンド採用を優先する"