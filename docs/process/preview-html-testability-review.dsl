framework PreviewHtmlTestabilityReview:
  requires problem and decision
  requires evidence or premise
  warns pending

domain PreviewHtmlTestability:
  description "VSIX preview を CLI からも同じ HTML artifact として出力し、Playwright で zoom/scroll/minimap の回帰を再現できる構造へ整理する"

problem P1:
  "現在の preview 挙動は VS Code webview 内でしか確認しづらく、zoom/scroll の不具合を再現・固定する回帰試験がない"

problem P2:
  "preview の HTML/CSS/script は renderDslPreview に集約されているが、CLI から同じ artifact を生成する公的導線がない"

problem P3:
  "preview script は acquireVsCodeApi を前提にしており、VS Code 外のブラウザでそのまま検証しづらい"

step S1:
  premise PR1:
    "UI 回帰を根本から詰めるには、エディタ内で見えている artifact と同一の HTML を headless browser で開けることが重要である"

step S2:
  premise PR2:
    "zoom/fit/reset/minimap/scrollbar の不具合は DOM と script の結合問題なので、unit test より browser automation で固定するほうが再発防止に向く"

step S3:
  evidence EV1:
    "renderDslPreview は DSL text、title、locale を受けて preview HTML 全体を返すため、CLI 出力と VSIX custom editor の共通 artifact として再利用できる"

step S4:
  evidence EV2:
    "現行 script は revealLocation 投稿のために acquireVsCodeApi を呼んでいるが、zoom/scroll/minimap の本体ロジックは VS Code API 非依存である"

step S5:
  evidence EV3:
    "zoom in/out の位置ずれのような不具合は、HTML を headless browser で開いて button click 後の scrollLeft/scrollTop と minimap viewport を検査すれば再現できる"

step S6:
  decision D1 based_on PR1, EV1:
    "CLI に preview html 出力コマンドを追加し、renderDslPreview が返す HTML をそのまま stdout またはファイルへ書けるようにする"

step S7:
  decision D2 based_on EV2, D1:
    "preview script は VS Code 依存を optional にし、acquireVsCodeApi が存在しない環境では no-op bridge を使って通常ブラウザでも動作させる"

step S8:
  decision D3 based_on PR2, EV3, D1, D2:
    "Playwright test は CLI で生成した HTML artifact を browser で開き、zoom in/out、fit、reset、scrollbar 位置、minimap viewport の主要回帰を検査する"

step S9:
  decision D4 based_on D1, D2, D3:
    "preview の不具合修正は、まず HTML artifact と browser test に落とし込んでから script/CSS を直す順に統一する"

step S10:
  pending PD1:
    "将来 screenshot regression まで入れるか、当面は DOM metric と scroll position assertion に留めるかは運用コストを見て調整が必要である"
