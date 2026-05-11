framework HelpNavigationDesign:
  requires problem and decision
  requires evidence or premise
  warns pending

domain HelpNavigation:
  description |
    DSL 文法ヘルプを索引付きの案内システムとして再構成し、
    query と DSLQL の導線を強化する設計を整理する

problem P1:
  "現行の dsl help は 1 枚の平坦な文法テキストで、query と DSLQL の学習導線が弱い"

problem P2:
  "CLI、MCP、VSIX tool から同じ help を呼べても、チャネルごとに適切な入口と応答量の制御がない"

problem P3:
  "LLM が help を使うときに、全量を毎回返すと長すぎる一方、局所ヒントだけでは関連機能への到達性が落ちる"

problem P4:
  |
    query の書き方は field access、pipe、select、related_decisions など複数の概念をまたぐため、
    逆引きと関連索引がないと把握しづらい

step S1:
  premise PR1:
    "ヘルプは全文を一度に表示する文書ではなく、索引から必要箇所へ段階的に辿れる情報体系として設計するべきである"

step S2:
  premise PR2:
    "文法ヘルプの主要利用者は人間だけでなく LLM でもあり、呼び出し単位の小ささと横断導線の豊富さを両立させる必要がある"

step S3:
  evidence EV1:
    |
      現行 guidance は top-level blocks と基本規則を 1 つの静的テキストへ並べており、
      query や DSLQL の詳細へ段階的に降りる見出し構造を持たない

step S4:
  evidence EV2:
    "docs/specs/dslql.md は詳細仕様を持つが、CLI の dsl help や parse error guidance からそこへ到達する索引と短い要約がない"

step S5:
  evidence EV3:
    |
      query は .problems[]、select(.id == \"P1\")、related_decisions、projection など複数要素の組み合わせで成立するため、
      構文一覧だけでは書き始めにくい

step S6:
  evidence EV4:
    "CLI、MCP、VSIX tool は同じ help source を共有できるが、各チャネルで一度に返せる適切な情報量と表示形式は異なる"

step S7:
  decision D1 based_on PR1, PR2, EV1, EV4:
    |
      help は単一文字列ではなく、index、reference_quick、reference_detail、usecase_index、
      related_index の複数セクションを持つ構造化リソースとして管理する

step S8:
  decision D2 based_on EV2, EV3, D1:
    "query と DSLQL には専用 index を設け、roots、operators、conditions、functions、projection、examples、errors の各入口から段階的に詳細へ辿れるようにする"

step S9:
  decision D3 based_on PR2, EV4, D1, D2:
    |
      help API は topic、subtopic、audience、channel、detail_level を受け取り、
      1 回の応答は index 1 件または関連セクション 2 から 4 件までに制限する

step S10:
  decision D4 based_on D1, D3:
    |
      CLI は `llmthink dsl help [topic] [subtopic]`、MCP は `dsl action=help topic=... subtopic=... detail=...`、
      VSIX tool は同じ論理引数を受ける形へ寄せ、全チャネルで同じ help graph を辿れるようにする

step S11:
  decision D5 based_on EV3, D2, D3:
    |
      parse error 時は全体文法を再掲する代わりに、原因に対応する quick reference と related index を返し、
      必要時だけ detail reference や query examples へ追跡できる導線を付ける

step S12:
  decision D6 based_on D2, D3, D5:
    |
      use case reverse index は `problem から decision を辿りたい`、`根拠のない decision を見つけたい`、
      `pending を含む step を探したい` のような目的文から query テンプレートと関連 reference を返す

step S13:
  decision D7 based_on D1, D2, D3, D4:
    "関連 index は各 help node に `see_also` を持たせ、query operator を見た利用者が root schema、relation functions、代表例、エラー回復へ横断できるようにする"

step S14:
  pending PD1:
    "help graph をコード上でどのデータ構造に置くか、静的 object、JSON schema、DSL 生成物のどれにするかは実装段階で固定する必要がある"

step S15:
  pending PD2:
    "detail_level の段階数と 1 回あたりの最大 section 数は CLI 出力、MCP token、VSIX UI の実測を見て最終調整する必要がある"

query Q1:
  .problems[] | select(.id == "P1") | related_decisions

query Q2:
  .problems[] | select(.id == "P2") | related_decisions

query Q3:
  .problems[] | select(.id == "P3") | related_decisions

query Q4:
  .problems[] | select(.id == "P4") | related_decisions