framework PreviewGraphSelection:
  requires problem or decision
  requires pending or evidence

domain PreviewGraph:
  description "VSIX preview の有向グラフ描画ライブラリ選定を整理する"

problem P1:
  "現在の preview graph は node 回避と可読性の両立ができていない"

problem P2:
  "role ごとの lane を維持しつつ edge routing を改善できる layout engine が必要である"

problem P3:
  "VS Code custom editor の webview で扱える依存に限定する必要がある"

step S1:
  premise PR1:
    "graph library は SVG 出力の見た目だけでなく、edge routing、lane 制約、依存コストを含めて選定すべきである"

step S2:
  evidence EV1:
    "dagre は layered graph の node 配置には向くが、障害物回避付きの orthogonal edge routing を直接は提供しない"

step S3:
  evidence EV2:
    "現在の preview では lane 維持のために座標と edge を手で補正しており、線の分かりにくさが再発している"

step S4:
  evidence EV3:
    "elkjs は layered algorithm、orthogonal routing、port/side 制約を webview 内で使える JavaScript 実装として提供する"

step S5:
  evidence EV4:
    "mermaid や Graphviz 系は導入容易性や見た目の初速はあるが、LLMThink 固有の lane 制御と source reveal 連携では抽象度が高すぎる"

step S6:
  evidence EV5:
    "ELK 実装では orthogonal routing と fixed-side ports を使い、click reveal と custom editor 契約を維持したまま layout engine を差し替えられる"

step S7:
  decision D1 based_on EV1, EV2:
    "preview graph の現状課題は dagre そのものより、dagre の責務外である edge routing を手実装で補っている点にあると整理する"

step S8:
  decision D2 based_on EV3, EV4:
    "preview graph library は elkjs を第一候補として採用し、SVG は引き続き自前生成しつつ layout と routing を ELK に委譲する"

step S9:
  decision D3 based_on PR1, D2, EV5:
    "click reveal、theme 追従、node copy clamp は現行 custom editor 実装を維持し、library 切り替えで UI 契約は変えない"

query Q1:
  .problems[] | select(.id == "P1") | related_decisions

query Q2:
  .problems[] | select(.id == "P2") | related_decisions

query Q3:
  .problems[] | select(.id == "P3") | related_decisions