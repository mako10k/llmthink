domain SemanticAuditSupport:
  description "思考の意味監査補助機能について、annotation、対象列挙、CLI 追記の責務分離をゼロベースで整理する"

problem P1:
  "現在の audit は構文・参照・局所整合性を確認できるが、evidence E1 が decision D1 の根拠として妥当かのような意味レベルの確認は支援していない"

problem P2:
  "意味監査を人手や LLM で実施しても、その結果が DSL 本体に残らなければ、どの根拠関係を確認済みかを再読時に判別しにくい"

problem P3:
  "監査対象を自由入力に任せると、どの pair を見落としたか分からず、監査 coverage を運用で保証しにくい"

problem P4:
  "annotation だけで意味監査結果を持たせると、statement 単位の注釈と edge 単位の判定が混ざり、E1-D1 のような対象を機械可読に特定しにくい"

problem P5:
  "質問文は locale に応じて自然言語化したいが、locale ごとに意味監査の対象や識別子まで変わると CLI と保存形式が不安定になる"

step S1:
  premise PR1:
    "この機能の目的は真偽を自動確定することではなく、意味監査の対象列挙、実施記録、再読性を改善することである"

step S2:
  premise PR2:
    "第一段階の監査対象は、decision の based_on に現れる explicit edge から機械的に列挙できるものへ限定したほうが説明可能である"

step S3:
  premise PR3:
    "locale は prompt の表現にだけ影響し、監査対象 id や保存される構造の意味は locale 非依存であるべきである"

step S4:
  premise PR4:
    "将来の再監査や人手レビューを考えると、意味監査結果は上書き専用より append 可能な記録として扱ったほうが運用しやすい"

step S5:
  evidence EV1:
    "既存 DSL では decision が based_on で problem、premise、evidence、viewpoint を参照しており、少なくとも explicit support pair は抽出できる"

step S6:
  evidence EV2:
    "既存 annotation は statement や problem に付く設計であり、E1-D1 のような pair 自体を第一級の対象として保持する構造ではない"

step S7:
  evidence EV3:
    "ユーザーが求めている例は E1-D1 のような pair id と、判断文・証拠文を含む locale-aware な質問文生成である"

step S8:
  evidence EV4:
    "CLI には thought audit、reflect、history など追記系の入口があり、意味監査の記録もコマンド化する余地がある"

step S9:
  decision D1 based_on P1, PR1, PR2, EV1, EV3:
    "意味監査補助機能の最小単位は statement 単体ではなく、decision とその根拠候補の explicit pair として扱う"

step S10:
  decision D2 based_on P3, D1, PR2, EV1:
    "第一段階で列挙する監査対象は、decision の based_on に含まれる evidence と premise を優先し、problem に対しては別種の問いとして後続検討に分ける"

step S11:
  decision D3 based_on P5, D1, PR3, EV3:
    "監査対象の stable id は E1-D1 のような locale 非依存の pair id とし、表示用 prompt は locale に応じて自然言語化する"

step S12:
  decision D4 based_on P3, PR1, PR3, EV4, D2, D3:
    "CLI はまず未監査 pair の列挙と prompt 生成を担い、その次に pair id、verdict、reason を受けて DSL へ結果を追記する二段階フローに分ける"

step S13:
  decision D5 based_on P2, P4, PR1, PR4, EV2:
    "意味監査の正式な保存形式は annotation 単独ではなく、pair id、verdict、reason、timestamp などを持てる専用 statement または同等の第一級構造として設計する"

step S14:
  decision D6 based_on P2, P4, D5:
    "annotation を導入する場合は、専用構造が存在することを前提に、statement 上へ '意味監査済みの要約表示' を与える補助ラベルに留める"

step S15:
  decision D7 based_on P5, D2, D3, D4:
    "locale-aware な質問文の初期形は、pair id、判断 text、根拠 text を埋めた定型文テンプレートとして実装し、意味監査ロジック自体は locale に依存させない"

step S16:
  pending PD1:
    "pair に対する保存構造を新しい statement role にするか、annotation を拡張して半構造化 payload を持たせるかは、parser 差分と query 性能を見て再判断が必要である"

step S17:
  pending PD2:
    "verdict を true or false の二値にするか、unknown や mixed を含む閉じた集合にするかは、実際の監査フローを見て決める必要がある"

step S18:
  pending PD3:
    "problem や viewpoint を prompt へどこまで同梱するかは、短さと誤読防止のバランスを見て調整が必要である"

step S19:
  pending PD4:
    "意味監査結果を本体 DSL に追記するだけで十分か、thought history や別 report にも残すべきかは、差分可読性と検索性を見て再判断が必要である"