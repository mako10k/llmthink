framework QueryReference:
  requires problem

domain QueryReference:
  description "query の未解決参照を検証する"

problem P1:
  "既知の problem"

query Q1:
  .problems[] | select(.id == "P2") | related_decisions