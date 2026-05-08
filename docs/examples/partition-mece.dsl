framework PartitionAudit

domain SupportTickets:
  description "問い合わせの分類"

problem P1:
  "問い合わせを一次分類する"
  annotation orphan_reference:
    "partition の単独例として分類軸だけを示すため、decision へはまだ接続していない"

step S1:
  viewpoint VP1:
    axis cause_type

step S2:
  partition PT1 on SupportTickets axis cause_type:
    A := billing_issue
    B := product_bug
    Others := not A and not B