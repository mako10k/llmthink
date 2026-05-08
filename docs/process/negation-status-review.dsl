framework NegationStatusReview:
  requires problem and decision
  requires pending or comparison

domain NegationStatus:
  description "既存ノードへ否定系の状態タグを追加する設計と、comparison 向きに基づく監査規則を整理する"

problem P1:
  "否定専用ノードを増やさず、既存ノードへ状態タグを追加する設計を整理する"

problem P2:
  "counterexample_to の向きと状態タグの整合を監査できる規則を整理する"

problem P3:
  "最小実装スライスを定め、既存 DSL と preview への影響を抑えて導入する"

step S1:
  premise PR1:
    "NegativeDecision のような専用ノード種別を導入すると、DSL の要素数と監査分岐が過剰に増える"

step S2:
  premise PR2:
    "反例 relation は、左側が反例、右側が崩される対象という向きで固定した方が監査規則を定義しやすい"

step S3:
  evidence EV1:
    "現在の comparison 監査は problem、viewpoint、decision 参照解決と、preference / incomparable の整合に集中している"

step S4:
  evidence EV2:
    "現在の annotation kind は固定列挙であり、状態を機械解釈するには grammar、AST、parser、audit、help の同時更新が必要である"

step S5:
  decision D1 based_on P1, PR1, EV2:
    "否定表現は新ノードではなく annotation status で既存ノードに付与し、状態値は閉じた集合で管理する"

step S6:
  decision D2 based_on P2, PR2, EV1:
    "counterexample_to は左側 decision が右側 decision を崩す向きで固定し、右側を否定候補として監査する"

step S7:
  decision D3 based_on D1, D2:
    "第一段階の状態値は rejected、negated、superseded に絞り、boolean 的な negative フラグは導入しない"

step S8:
  decision D4 based_on D2, D3:
    "第一段階の監査では unknown status、排他的 status 併記、counterexample_to と状態の向き不整合、状態だけ存在して比較根拠がないケースを検出する"

step S9:
  pending PD1:
    "annotation status の具体構文を annotation kind として増やすか、annotation key-value 化するかは今回の実装前に最終決定が必要である"

step S10:
  pending PD2:
    "preview 上で rejected と negated と superseded をどう視覚区別するかは、監査導入後に段階追加してよい"

step S11:
  decision D5 based_on P3, D1, D4, PD1:
    "最小実装は annotation status を kind として追加し、値は自由文字列ではなく annotation text で列挙検査する形から始める"

query Q1:
  .problems[] | select(.id == "P1") | related_decisions

query Q2:
  .problems[] | select(.id == "P2") | related_decisions

query Q3:
  .problems[] | select(.id == "P3") | related_decisions