framework VersionBumpRules:
  requires problem and decision
  requires evidence or premise
  warns pending

domain ReleaseVersioning:
  description "llmthink の root package、MCP server、VSIX extension の version bump ルールを定義する"

problem P1:
  "root package.json、MCP server、VSIX extension が別々に更新されると、利用者がどの配布物にどの機能が入ったか追跡しづらい"

problem P2:
  "変更が積み重なってからまとめて version を動かすと、どの差分で何が公開されたかが曖昧になる"

problem P3:
  "DSL 文法、help 導線、UI surface、保存スキーマの変更は影響範囲が異なるため、patch/minor/major の判断基準が必要である"

step S1:
  premise PR1:
    "利用者向けに一緒に配布・告知する成果物は、同じ release version を共有したほうが運用負荷と認知負荷が低い"

step S2:
  premise PR2:
    "version bump は変更後の後処理ではなく、公開可能な差分を main へ載せる時点で行うべきである"

step S3:
  evidence EV1:
    "現状は root package が 0.3.0、VSIX が 0.3.20 のように乖離しており、help や preview の変更がどの版に含まれるか直感的でない"

step S4:
  evidence EV2:
    "このリポジトリでは CLI、MCP、VSIX が同じ DSL core と help graph を共有するため、利用者視点では 1 つの release と見なすほうが自然である"

step S5:
  evidence EV3:
    "thought reflect の設計判断でも、UI surface と永続化スキーマを増やす変更は patch ではなく minor 扱いが妥当だと整理している"

step S6:
  decision D1 based_on PR1, PR2, EV1, EV2:
    "root package.json、vscode-extension/package.json、src/mcp/server.ts の version は同じ release version を共有し、main へ入る公開差分ごとに同時に bump する"

step S7:
  decision D2 based_on PR2, EV2:
    "user-visible な fix、help/preview/UI の改善、DSL examples や docs の追加更新など、公開成果物に反映される後方互換な差分は patch を 1 つ進める"

step S8:
  decision D3 based_on EV3, D1, D2:
    "後方互換を保ちながらも DSL surface、CLI/MCP/VSIX command surface、保存 schema、query capability を増やす変更は minor を進め、patch を 0 に戻す"

step S9:
  decision D4 based_on D1, D3:
    "既存 DSL、CLI/MCP contract、保存 schema、または既存 VSIX workflow を破壊する変更は major を進める"

step S10:
  decision D5 based_on D1, D2:
    "workspace 内部の refactor のみで利用者向け挙動も配布物も変わらない場合は version を動かさないが、その判断は release note に残せる程度に限定する"

step S11:
  pending PD1:
    "将来 package publish と VSIX publish を別 cadence に分離する場合は、共有 release version を維持したまま配布タイミングだけずらすか、個別 version へ分離するか再判断が必要である"
