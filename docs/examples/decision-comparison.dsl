problem P1:
  "同一 scope で decision を比較したい"

step S1:
  viewpoint VP1:
    axis cost

step S2:
  decision D1 based_on P1, VP1:
    "hosted option を選ぶ"
    annotation status:
      "rejected"
    annotation rationale:
      "counterexample により前提が崩れたため、採用候補から外す"

step S3:
  decision D2 based_on P1, VP1:
    "self-hosted option を選ぶ"

step S4:
  comparison CMP1 on P1 viewpoint VP1 relation preferred_over D1, D2:
    "cost では hosted option を優先する"

step S5:
  comparison CMP2 on P1 viewpoint VP1 relation counterexample_to D2, D1:
    "self-hosted option は hosted option のコスト前提を崩す反例として扱える"