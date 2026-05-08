framework DecisionComparisonReview:
  requires problem and decision
  requires evidence or viewpoint
  warns pending

domain DecisionComparison:
  description "decision にグローバルな重みを与えるのではなく、problem と viewpoint に束ねた相対比較を導入する案が妥当かを整理する"

problem P1:
  "decision に単純な重みを持たせると、何に対する重みか不明なまま数値だけが独り歩きしやすい"

problem P2:
  "同じ decision でも cost と safety のように viewpoint が違えば優劣が逆転しうるため、スコープなしの比較は誤解を招く"

problem P3:
  "数値スコアは比較可能性を過剰に仮定しやすく、論点が違う decision 同士を無理に同一尺度へ押し込む危険がある"

problem P4:
  "それでも、同じ問題について複数 decision 候補があり、ある viewpoint 上でどちらを優先するかを明示したい場面はある"

step S1:
  premise PR1:
    "この DSL は truth 判定よりも、思考構造と判断根拠を明示することを優先している"

step S2:
  premise PR2:
    "decision の比較は absolute score よりも、限定された文脈での relative preference として表したほうが読み手に誤解を与えにくい"

step S3:
  evidence EV1:
    "既存 DSL には problem、viewpoint、decision があり、判断対象、評価軸、判断結果をすでに分離して表現できる"

step S4:
  evidence EV2:
    "requirements の監査サンプルでも cost viewpoint 上で D1 と D2 の緊張関係を読む前提になっており、比較は無文脈ではなく観点付きで解釈されている"

step S5:
  evidence EV3:
    "数値スコアを入れると、score の意味、範囲、加算可否、viewpoint 間比較可能性まで追加設計が必要になり、MVP としては重い"

step S6:
  evidence EV4:
    "pairwise comparison なら D1 が D2 より優先される文脈だけを局所的に述べられ、全 decision を単一順序へ並べる必要がない"

step S7:
  evidence EV5:
    "global weight は preview や audit で一見便利でも、異なる problem をまたぐ比較可能性を暗黙に匂わせるため、DSL の本来意図から外れやすい"

step S8:
  decision D1 based_on PR1, PR2, EV1, EV3, EV5:
    "decision にスコープなしの global weight や numeric score を直接持たせる案は採用しない"

step S9:
  decision D2 based_on PR1, PR2, EV1, EV2, EV4:
    "比較を導入するなら、同一 problem と viewpoint に束ねた relative comparison として導入する"

step S10:
  decision D3 based_on D2, EV4:
    "比較結果は数値ではなく、preferred_over、weaker_than、incomparable のような閉じた関係集合で表す方向がよい"

step S11:
  decision D4 based_on D2, D3:
    "比較構文は decision 自体の本文へ weight を埋め込むより、comparison のような別要素で left decision、right decision、problem、viewpoint、relation を明示する方向がよい"

step S12:
  decision D5 based_on D4:
    "audit は同じ problem / viewpoint 内で comparison cycle、incomparable と preferred_over の矛盾、片側 decision 不在を検査対象にできる"

step S13:
  pending PD1:
    "comparison を新しい statement role にするか query / annotation 拡張で済ませるかは、parser 差分と preview 表示コストを見て再判断が必要である"

step S14:
  pending PD2:
    "preferred_over などの relation 集合を total order に寄せるか partial order に留めるかは、実際のユースケースを見て再判断が必要である"