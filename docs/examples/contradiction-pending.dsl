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