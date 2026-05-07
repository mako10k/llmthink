framework CommentDesignReview:
  requires problem or decision
  requires pending or evidence

domain DslComments:
  description "DSL のコメントと注釈の導入方針を整理する"

problem P1:
  "DSL に自由コメントをどう導入するか"

problem P2:
  "意味付きコメントを comment ではなく注釈としてどう導入するか"

problem P3:
  "formatter、LSP、audit への影響を抑えつつ段階導入するにはどうするか"

step S1:
  premise PR1:
    "現行 DSL は役割キーワードで構造を明示する設計を優先している"

step S2:
  evidence EV1:
    "自由コメントは parser で読み飛ばすだけでも可読性向上に寄与し、既存の行ベース構文とも衝突しにくい"

step S3:
  evidence EV2:
    "意味付きコメントは AST 上で所有先と kind を持つ構造化要素として扱わないと statement role と競合しやすい"

step S4:
  evidence EV3:
    "formatter が AST から文書を再構成するため、保持したいコメント系要素は保存規則を先に決める必要がある"

step S5:
  evidence EV4:
    "自由コメントを # から始まる独立行に限定すると、既存の行ベース parser に blank line 同様の読み飛ばし規則を追加しやすい"

step S6:
  evidence EV5:
    "annotation kind を explanation、rationale、caveat、todo の閉じた集合にすると、role 競合を抑えつつ editor 補完と監査規則を設計しやすい"

step S7:
  pending PD1:
    "自由コメントの末尾行コメントを許可するかどうかは parser の誤認識リスクを見て後続で判断する"

step S8:
  pending PD2:
    "annotation を viewpoint や partition のような構造化 statement にも広げるかは所有関係の表現を見て後続で判断する"

step S9:
  decision D1 based_on PR1, EV1:
    "第一段階では監査対象外かつ参照解決対象外の自由コメントだけを導入する"

step S10:
  decision D2 based_on PR1, EV2:
    "第二段階では意味を持つ記述を comment ではなく annotation のような第一級の注釈要素として導入する"

step S11:
  decision D3 based_on EV2, EV3:
    "注釈は最初から全要素に開放せず、problem、step statement、decision のような限定された所有先から始める"

step S12:
  decision D4 based_on EV2:
    "注釈 kind は自由文字列にせず、role との競合を避けるため閉じた列挙として設計する"

step S13:
  decision D5 based_on EV1, EV4:
    "自由コメントの第一段階構文は、行頭インデントの後に # を置く独立行コメントとする"

step S14:
  decision D6 based_on EV2, EV5:
    "annotation の第一候補 kind は explanation、rationale、caveat、todo とする"

step S15:
  decision D7 based_on EV2, EV3:
    "annotation の初期所有先は problem と、text を本文に持つ premise、evidence、decision、pending に限定する"

step S16:
  decision D8 based_on EV3, EV4:
    "parser と formatter の第一段階は自由コメントを AST へ載せず、format document ではコメントを保持しない簡易方式で入る"

step S17:
  decision D9 based_on EV2, EV3, EV5:
    "annotation は owner の本文行の直後に annotation kind ブロックとしてぶら下げる構文を採用する"

query Q1:
  .problems[] | select(.id == "P1") | related_decisions

query Q2:
  .problems[] | select(.id == "P2") | related_decisions

query Q3:
  .problems[] | select(.id == "P3") | related_decisions
