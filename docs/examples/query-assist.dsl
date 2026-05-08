framework ReviewAudit

domain DesignReview:
  description "設計レビュー論点"

problem P1:
  "監査結果に関連する判断を洗い出す"

step S1:
  evidence EV1:
    "主要な判断を先に固定すると議論の再読性が上がる"

step S2:
  decision D1 based_on P1, EV1:
    "ADR を先に確定する"

query Q1:
  .problems[] | select(.id == "P1") | related_decisions