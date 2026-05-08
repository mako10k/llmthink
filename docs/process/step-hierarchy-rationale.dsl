framework StepHierarchyRationale:
  requires problem and decision
  requires evidence or premise

domain StepModel:
  description "step と statement role を階層化する理由、および Step ID と statement ID の責務分離を整理する"

problem P1:
  "なぜ evidence decision premise pending などを top-level 要素ではなく step 配下の statement として持たせるのかを説明したい"

problem P2:
  "step の意味が曖昧だと Step ID と statement ID の使い分けが崩れる"

problem P3:
  "based_on や query がどちらの ID を参照すべきかを明確にしたい"

step S1:
  premise PR1:
    "step は推論列の中で 1 回の思考操作を置くための構造単位であり、statement role はその操作がどの意味種別に属するかを表す意味単位である"

step S2:
  evidence EV1:
    "AST では StepDecl が step.id と statement を持ち、statement 側に premise viewpoint partition evidence decision pending の union role が載る"

step S3:
  evidence EV2:
    "構文仕様では step 本文は 1 要素のみを持つため、1 つの step が複数 role を混在させない"

step S4:
  evidence EV3:
    "DecisionStatement の basedOn は statement 側の参照一覧として保持され、step 全体ではなく根拠 statement を直接参照する"

step S5:
  evidence EV4:
    "監査参照は ref_id に加えて role と step_id を併記できるため、semantic target と structural location を分けて扱う前提になっている"

step S6:
  evidence EV5:
    "preview 表示でも見出しは step.id · statement.role statement.id の形で描かれ、順序 anchor と参照 anchor を分離している"

step S7:
  decision D1 based_on PR1, EV1, EV2:
    "statement role を step 配下へ入れる理由は、1 回の思考操作に 1 つの意味種別を割り当て、構造上の順序と意味上の種別を直交させるためである"

step S8:
  decision D2 based_on EV1, EV4, EV5:
    "Step ID は推論列の中での位置、UI 表示、監査位置、将来の step-level metadata の anchor として使い、statement ID は意味参照と cross-reference の anchor として使う"

step S9:
  decision D3 based_on EV3, D2:
    "based_on が参照すべきなのは Step ID ではなく statement ID である。decision が必要とするのは container の順番ではなく、どの premise evidence decision pending を根拠にしたかという意味参照だからである"

step S10:
  decision D4 based_on D1, D2, D3:
    "この階層化により、step を sequence container として安定化しつつ、statement role を query audit graph で再利用できるため、DSL は読みやすさと機械処理の両方を維持できる"

step S11:
  pending PD1:
    "将来 step-level annotation や grouping を導入する場合、Step ID と statement ID の責務をどこまで増やすかは別途整理が必要である"

query Q1:
  .problems[] | select(.id == "P1") | related_decisions

query Q2:
  .problems[] | select(.id == "P2") | related_decisions

query Q3:
  .problems[] | select(.id == "P3") | related_decisions