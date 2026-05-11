framework OrphanNodeReview:
  requires problem and decision
  requires evidence or premise or pending
  warns pending

domain OrphanNodeAudit:
  description |
    思考グラフ内で他ノードとつながらない problem / premise / evidence / decision を監査し、
    意図的な孤立だけを機械可読に許可する方針を整理する

problem P1:
  |
    現行 audit は unresolved reference や decision without based_on は見るが、
    宣言されているのにどこにもつながらない orphan node は見ていない

problem P2:
  |
    孤立した problem は解決や保留との関係が示されておらず、
    孤立した premise / evidence は何のために記載されているのか読み手に伝わりにくい

problem P3:
  "すべての孤立を一律に error にすると、将来用メモや参考資料のような意図的な孤立までノイズ扱いになりうる"

problem P4:
  |
    意図的孤立を単なる自由文コメントで表すと、
    audit が suppress 条件として安定して読めず、preview や LSP でも意味を共有しにくい

step S1:
  premise PR1:
    "この DSL の監査は truth 判定ではなく、内部整合性と再読性の補助を主目的にしている"

step S2:
  premise PR2:
    |
      first pass の orphan 判定は、推測的な意味解析ではなく
      明示された based_on 辺だけで決めたほうが実装と説明が単純である

step S3:
  premise PR3:
    |
      意図的な例外は free text ではなく閉じた理由集合を持つ機械可読な構文で表したほうが、
      audit suppress と editor support を一貫させやすい

step S3A:
  premise PR4:
    "既存の rule で十分に表せる failure mode に対しては、同義の orphan rule を重ねて増やさないほうが audit 出力が単純である"

step S3B:
  premise PR5:
    "orphan 検出は再読支援の性格が強いため、problem と supporting statement の severity は最初から強くしすぎないほうがよい"

step S3C:
  premise PR6:
    "新しい構文は parser と formatter の差分を最小にするため、可能なら既存 annotation 機構の拡張で済ませたい"

step S3D:
  premise PR7:
    "suppress された orphan も完全に不可視にすると読者が意図的孤立の存在を見落とすため、弱い表示は残したほうがよい"

step S4:
  evidence EV1:
    "現在の AST と parser には annotation があり、problem と text-bearing statement に閉じた kind を持つ注釈を付けられる"

step S5:
  evidence EV2:
    "decision without based_on はすでに contract_violation error として扱われているため、orphan decision の最小形は既存ルールで捕捉済みである"

step S6:
  evidence EV3:
    "preview graph も based_on を主な explicit edge として描いているため、orphan 判定を同じ explicit graph に揃えると UI と audit が一致する"

step S7:
  evidence EV4:
    |
      annotation kind は現状 explanation / rationale / caveat / todo の閉じた集合であり、
      ここに orphan 用 kind を追加するなら parser / AST / formatter の拡張差分が比較的小さい

step S8:
  decision D1 based_on PR1, PR2, EV2, EV3:
    "orphan node 監査は、まず explicit based_on graph に対する局所判定として導入する"

step S9:
  decision D2 based_on PR4, EV2:
    "decision は based_on が空なら既存の decision_without_reference を orphan decision 相当として扱い、別ルールを増やさない"

step S10:
  decision D3 based_on PR1, PR2, EV3:
    "problem orphan は、どの decision からも直接 based_on 参照されていない problem と定義する"

step S11:
  decision D4 based_on PR1, PR2, EV3:
    "premise orphan と evidence orphan は、どの decision からも直接 based_on 参照されていない statement と定義する"

step S12:
  decision D5 based_on PR5, D3, D4:
    "problem orphan は warning、premise orphan と evidence orphan はまず hint とし、運用でノイズが低いことを確認してから severity を再調整する"

step S13:
  decision D6 based_on PR3, PR6, EV1, EV4:
    "意図的孤立を許可する文法は新しい自由文コメントではなく annotation kind の拡張として導入する"

step S14:
  decision D7 based_on PR3, D6:
    "第一段階の意図的孤立 annotation kind は orphan_future と orphan_reference の 2 種に限定する"

step S15:
  decision D8 based_on D6, D7:
    |
      orphan_future と orphan_reference は problem、premise、evidence、decision、pending のような
      text-bearing node に付与でき、対応する orphan 監査だけを suppress する

step S16:
  decision D9 based_on PR7, D5, D8:
    "suppress された orphan node はエラーを消すだけでなく、preview と report では intentional orphan と分かる弱い表示を残す"

step S17:
  pending PD1:
    |
      problem を直接 based_on 参照しないが、premise / evidence を介して実質的に解いている文書を orphan とみなすかは、
      将来 transitive graph を導入するかと合わせて再判断が必要である

step S18:
  pending PD2:
    |
      orphan_reference を evidence だけに限定するか、problem / premise にも許可するかは
      実運用のノイズを見て再判断が必要である