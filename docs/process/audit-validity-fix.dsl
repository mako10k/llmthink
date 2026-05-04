framework AuditValidityFix:
  requires problem or decision
  requires pending or evidence

domain AuditValidity:
  description "監査ロジックの妥当性を改善する修正方針を整理する"

problem P1:
  "query 引数の未解決参照を仕様どおり検出する"

problem P2:
  "framework requires の and/or 評価を仕様に近づける"

problem P3:
  "contradiction_candidate を過検知しにくい補助情報へ寄せる"

step S1:
  premise PR1:
    "監査は truth 判定ではなく、内部整合性と再読支援に集中するべきである"

step S2:
  evidence EV1:
    "現状の query は query_result にだけ使われ、fatal な未解決参照監査に入っていない"

step S3:
  evidence EV2:
    "framework requires は token の一部一致で通るため and/or 論理を十分に表現できていない"

step S4:
  evidence EV3:
    "contradiction_candidate は補助情報として残しつつ、warning より弱い扱いに寄せた方が signal-to-noise が上がる"

step S5:
  decision D1 based_on PR1, EV1:
    "query 引数は unresolved_reference として fatal 監査に入れる"

step S6:
  decision D2 based_on PR1, EV2:
    "framework requires は and を優先して評価し、or で節を分ける"

step S7:
  decision D3 based_on PR1, EV3:
    "contradiction_candidate は hint に落とし、shared based_on を持つ組だけを対象にする"

query Q1:
  .problems[] | select(.id == "P1") | related_decisions

query Q2:
  .problems[] | select(.id == "P2") | related_decisions

query Q3:
  .problems[] | select(.id == "P3") | related_decisions