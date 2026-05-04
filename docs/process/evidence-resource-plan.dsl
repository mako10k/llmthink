framework EvidenceResourceReview:
  requires problem or decision
  requires pending or evidence

domain EvidenceResource:
  description "evidence に URL や BLOB などの外部リソースを持たせる拡張方針を整理する"

problem P1:
  "evidence に追加する resource モデルを整理する"

problem P2:
  "resource 付き evidence の監査と参照方法を整理する"

problem P3:
  "resource の埋め込み方針を一旦保留しつつ拡張可能にする"

step S1:
  premise PR1:
    "既存の evidence text を壊さず、resource を後方互換で追加できる構文にするべきである"

step S2:
  evidence EV1:
    "URL、file path、BLOB digest、mime type、label などは evidence resource の最小属性候補である"

step S3:
  evidence EV2:
    "監査では resource の存在確認、scheme 妥当性、mime と digest の整合、アクセス不能時の warning を扱える"

step S4:
  pending PD1:
    "BLOB 本文そのものを DSL に埋め込むか、外部参照とメタデータだけを持つかはまだ決めきれていない"

step S5:
  pending PD2:
    "resource ごとの埋め込みは URL 取得、テキスト抽出、画像 caption、バイナリ fingerprint など媒体別の前処理が必要である"

step S6:
  decision D1 based_on PR1, EV1:
    "第一段階では evidence text を維持したまま resource ブロックを追加し、URL と file path と digest を扱えるようにする"

step S7:
  decision D2 based_on PR1, EV2:
    "第二段階では parser と AST と audit を拡張し、resource validation と LSP 補完を追加する"

step S8:
  decision D3 based_on PR1, PD2:
    "埋め込みは evidence 本文と resource メタデータを優先し、本文取得や媒体別埋め込みは別フェーズへ分離する"

query Q1:
  related_decisions(P1)

query Q2:
  related_decisions(P2)

query Q3:
  related_decisions(P3)