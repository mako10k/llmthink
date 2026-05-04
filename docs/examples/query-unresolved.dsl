framework QueryReference:
  requires problem

domain QueryReference:
  description "query の未解決参照を検証する"

problem P1:
  "既知の problem"

query Q1:
  related_decisions(P2)