framework StepFlatteningReview:
  requires problem and decision
  requires evidence or premise

domain StepSimplification:
  description "step の冗長性、statement role の top-level 化、Step ID の代替案を再評価する"

problem P1:
  "現在の DSL では evidence decision premise pending viewpoint partition が step の内側でしか使われず、step が見た目上冗長に見える"

problem P2:
  "構造上の位置に専用 ID を毎回振る負荷が、得られる利得より大きい可能性がある"

problem P3:
  "監査位置や参照識別は line 番号、statement ID、導出 step index で代替できるのではないかを見極めたい"

step S1:
  premise PR1:
    "設計要素は、その要素なしでは維持できない責務があるときだけ明示構文として残すべきである"

step S2:
  evidence EV1:
    "現行文法では problem は top-level だが、premise evidence decision pending viewpoint partition は step 本文でしか現れない"

step S3:
  evidence EV2:
    "parser は step header の直後に 1 つの statement を読むだけであり、step 自体は複数 statement の grouping や branch container にはなっていない"

step S4:
  evidence EV3:
    "formatter も実質的には statement を 1 段深くインデントして step header を出しているだけで、step 固有の追加情報は持っていない"

step S5:
  evidence EV4:
    "based_on は statement ID を参照し、query や semantic graph も statement.id を主 anchor として扱っている"

step S6:
  evidence EV5:
    "監査結果の step_id は補助的 metadata として付いているが、主参照は ref_id と role であり、step_id がないと成立しない契約にはなっていない"

step S7:
  evidence EV6:
    "line 番号は diagnostics には有効だが、format や comment 追加で変動しやすく、永続参照 ID としては弱い"

step S8:
  decision D1 based_on PR1, EV1, EV2, EV3:
    "現行 DSL に限れば、step は author-facing 構文としては冗長寄りであり、statement role を top-level 化しても主要機能は大きく損なわれない可能性が高い"

step S9:
  decision D2 based_on EV4, EV5, EV6:
    "Step ID を完全に line 番号へ置き換えるのは不適切だが、statement ID を主識別子にし、構造位置は導出 index または diagnostics metadata に寄せる設計は現実的である"

step S10:
  decision D3 based_on D1, D2:
    "authoring simplicity を優先するなら、problem は top-level のまま維持し、premise evidence decision pending viewpoint partition を top-level statement へ昇格し、step は暗黙の sequence として扱う案を第一候補にしてよい"

step S11:
  decision D4 based_on EV2, EV3, D3:
    "将来 step-level metadata、複数 statement grouping、explicit branch container が必要になるまでは、明示 step を必須構文にしないほうが DSL の負荷は低い"

step S12:
  pending PD1:
    "flattened grammar へ移る場合、既存 DSL、LSP symbol tree、preview 表示、audit report の step_id 互換をどう移行するかは別途設計が必要である"

query Q1:
  .problems[] | select(.id == "P1") | related_decisions

query Q2:
  .problems[] | select(.id == "P2") | related_decisions

query Q3:
  .problems[] | select(.id == "P3") | related_decisions