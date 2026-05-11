framework QueryReference:
  requires problem

domain QueryReference:
  description "query の未解決参照を検証する"

problem P1:
  "既知の problem"
  annotation orphan_reference:
    |
      未解決 query 参照だけを検証する例のため、
      problem は意図的に decision へ接続していない

query Q1:
  .problems[] | select(.id == "P2") | related_decisions