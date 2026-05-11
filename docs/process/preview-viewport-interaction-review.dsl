framework PreviewViewportInteractionReview:
  requires problem and decision
  requires evidence or premise
  warns pending

domain PreviewViewportInteraction:
  description |
    VSIX preview の zoom、fit、drag、minimap、scrollbar の責務分離を整理し、
    位置ずれの根本原因を見直す

problem P1:
  "zoom in/out を押すたびに表示位置がずれ、利用者が見ていた領域を維持できない"

problem P2:
  "scrollbar の見た目位置、viewport の黒い表示領域、minimap viewport の矩形が別々の DOM と計算規則に依存している"

problem P3:
  |
    fit、reset、zoom、node center、drag-pan がそれぞれ別の再配置規則を持ち、
    どの操作が viewport anchor を維持するのか不明瞭である

step S1:
  premise PR1:
    |
      viewport interaction は CSS の box 責務と script の scroll anchor 責務を分離し、
      どの操作が anchor preserve でどの操作が recenter かを明示するべきである

step S2:
  premise PR2:
    |
      zoom 操作の期待値は、特別な指示がない限り現在見ている viewport center か focus target を維持することであり、
      毎回固定位置へ再配置することではない

step S3:
  evidence EV1:
    |
      現行実装では applyZoom が svg width/height 更新後に centerViewport を呼び、
      zoom 操作でも fit/reset と同じ再配置を行っている

step S4:
  evidence EV2:
    "centerViewport は横方向を中央、縦方向を下端へ固定し、利用者が直前に見ていた領域を参照していない"

step S5:
  evidence EV3:
    |
      minimap viewport 矩形は scroll と svg の client rect 差分から再計算されるため、
      zoom 後の scroll position が不安定だと minimap も追従してずれて見える

step S6:
  evidence EV4:
    |
      CSS では diagram-viewport が黒い表示領域、diagram-scroll が scroll container、
      diagram-stage が intrinsic size を持つ stage であり、script 側がこの責務境界を前提にしないと scrollbar と viewport anchor が不整合になる

step S7:
  decision D1 based_on PR1, PR2, EV1, EV2:
    |
      zoom in/out は viewport anchor preserve とし、
      現在の viewport center を content coordinate に変換して zoom 後の scrollLeft/scrollTop を再構成する

step S8:
  decision D2 based_on EV1, EV2:
    "fit と reset は zoom と分離し、明示的に recenter してよい操作として扱う"

step S9:
  decision D3 based_on EV3, EV4, D1, D2:
    |
      minimap viewport、drag-pan、scrollbar 位置は diagram-scroll を唯一の scroll source として扱い、
      viewport の見えている矩形はその結果として導出する

step S10:
  decision D4 based_on EV4, D3:
    |
      CSS では diagram-viewport が clipping window、diagram-scroll が full-size scroll box、
      diagram-stage が content sizing を担当する構造を維持し、script ではそれぞれの責務を混同しない

step S11:
  pending PD1:
    |
      将来 pointer-centered zoom や trackpad zoom を入れる場合、
      viewport center preserve ではなく pointer anchor preserve へ一般化する余地がある
