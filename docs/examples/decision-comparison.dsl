problem P1:
  "同一 scope で decision を比較したい"

step S1:
  viewpoint VP1:
    axis cost

step S2:
  decision D1 based_on P1, VP1:
    "hosted option を選ぶ"

step S3:
  decision D2 based_on P1, VP1:
    "self-hosted option を選ぶ"

step S4:
  comparison CMP1 on P1 viewpoint VP1 relation preferred_over D1, D2:
    "cost では hosted option を優先する"