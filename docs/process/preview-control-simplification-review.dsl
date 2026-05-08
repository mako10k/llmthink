framework PreviewControlSimplificationReview:
  requires problem and decision
  requires evidence or premise
  warns pending

domain PreviewControlSimplification:
  description "VSIX preview の minimap、zoom controls、default fit、scroll container 構造を簡素化する"

problem P1:
  "minimap title、zoom rate、hint text、drag handle、selected state、anchor preserve などが積み重なり、見た目も実装も過剰になっている"

problem P2:
  "default fit 時にも scrollbar が見えたり、zoom 時に map area 全体が動くなど、scroll container と content sizing の責務が曖昧である"

problem P3:
  "controls と minimap が別々に複雑化し、利用者に必要な affordance より UI ノイズのほうが大きい"

step S1:
  premise PR1:
    "preview interaction は first paint を fit に固定し、viewport、scroll source、content sizing、overlay controls の責務を最小限に分離するべきである"

step S2:
  premise PR2:
    "UI affordance は title や説明文より、位置、透明度、cursor、hover、簡潔な icon で示したほうが lightweight である"

step S3:
  evidence EV1:
    "現行 preview は minimap title、zoom level、hint text、drag state、selected class、recenter と preserve の両ロジックを持ち、DOM/CSS/script の結合が強い"

step S4:
  evidence EV2:
    "default fit で scrollbar が見える主因は content に padding や extra sizing layer があり、fit 計算と実描画サイズが一致していないことである"

step S5:
  evidence EV3:
    "diagram-stage のような中間 wrapper と centered max-content layout は zoom 後の reflow を複雑にし、map area drift の原因になる"

step S6:
  decision D1 based_on PR1, EV2, EV3:
    "main map は viewport > scroll > svg の 3 層を基本構造とし、content sizing を svg 自身に集約する。不要な middle layer と layout workaround は除去する"

step S7:
  decision D2 based_on PR2, EV1:
    "minimap は title や zoom rate を表示せず、小型の半透明 overlay とする。hover で opacity を上げ、grab cursor と最小の handle affordance だけを残す"

step S8:
  decision D3 based_on PR2, EV1:
    "zoom in/out/reset/fit controls は main viewport の下端 overlay に集約し、低 opacity の icon strip として表示する"

step S9:
  decision D4 based_on PR1, EV2, D1:
    "default render は fit とし、fit 時に overflow が出ないよう fit 計算は viewport 実寸に一致させる。overflow がないとき scrollbar は native に非表示とする"

step S10:
  decision D5 based_on D1, D2, D3, D4:
    "zoom 操作は simple scroll-anchor preserve を維持するが、selected state、zoom rate label、説明文など secondary state は削除する"

step S11:
  pending PD1:
    "将来 pointer-centered zoom や keyboard shortcut を追加するなら、現在の simple model の上に別途追加設計する"
