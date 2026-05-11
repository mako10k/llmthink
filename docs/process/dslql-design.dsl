domain DSLQLDesign:
  description "jq 風の操作感を持つ DSLQL の設計方針を整理する"

problem P1:
  "llmthink の query を、最小関数呼び出しより表現力の高い jq 風クエリ言語へどう拡張するか"

problem P2:
  "DSLQL をどの層へ導入すれば query の正規構文として成立するか"

problem P3:
  "DSLQL の MVP で何を入れて何を外すべきか"

step S1:
  premise PR1:
    "llmthink の主対象は JSON 一般ではなく、thought DSL の AST、監査結果、thought metadata である"

step S2:
  premise PR2:
    "jq の価値は JSON 互換そのものより、pipe、select、map、field access、safe navigation による局所探索のしやすさにある"

step S3:
  evidence EV1:
    "現行 DSL の query は function call 1 行のみで、絞り込み、射影、並び替え、集約を表現できない"

step S4:
  evidence EV2:
    |
      parser と AST は query expression を string として保持しているため、
      top-level 構造を変えずに evaluator 側で DSLQL を導入できる

step S5:
  evidence EV3:
    "requirements では query を検索要求だけでなく思考の検査手段として位置付けるべきだとしている"

step S6:
  decision D1 based_on PR1, PR2, EV1, EV3:
    |
      DSLQL は jq 互換を目指すのではなく、
      thought graph と audit result に対する jq 風の query language として定義する

step S7:
  decision D2 based_on EV2:
    "DSLQL は新しい top-level keyword を追加せず、既存 query ブロックの正規 expression として導入する"

step S8:
  decision D3 based_on PR2, EV1, EV2:
    |
      DSLQL の MVP は field access、stream 展開、pipe、select、projection、関連参照関数に絞り、
      重い集約や再帰探索は後回しにする

step S9:
  pending PD1:
    "query body を複数行 pipeline へ拡張するかどうかは editor support と parser 複雑度を見て後続で判断する"

step S10:
  pending PD2:
    |
      search result、audit result、persisted thought metadata の統一 root schema は
      evaluator 設計時にさらに固定する必要がある