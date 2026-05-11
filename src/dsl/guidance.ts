import {
  listDslExamples,
  resolveDslExamplePath,
} from "./examples.js";
import type { AuditIssue, AuditReport } from "../model/diagnostics.js";
import type { ParseError } from "../parser/parser.js";

const ENGINE_VERSION = "0.1.0";

export type DslHelpDetail = "index" | "quick" | "detail";
export type DslHelpChannel = "cli" | "mcp" | "vsix";

export interface DslHelpRequest {
  topic?: string;
  subtopic?: string;
  detail?: DslHelpDetail;
  channel?: DslHelpChannel;
  maxRelated?: number;
}

interface ParseErrorHelp {
  rationale: string;
  expectedSyntax: string;
}

interface ParseErrorHelpRule {
  matches: (message: string) => boolean;
  help: ParseErrorHelp;
}

interface HelpNode {
  key: string;
  title: string;
  summary: string;
  quick: string[];
  detail: string[];
  examples?: string[];
  exampleSamples?: string[];
  index?: Array<{ key: string; label: string; summary: string }>;
  related?: string[];
}

const HELP_HEADER = "LLMThink DSL Help";

const HELP_NODES: HelpNode[] = [
  {
    key: "overview",
    title: "Index",
    summary: "DSL と DSLQL の入口を topic ごとに辿るための索引。",
    quick: [
      "まず topic を選び、必要なら subtopic へ降りる。",
      "topic だけ指定した場合は index を返し、topic + subtopic では quick reference を返す。",
      "query は専用 index を持ち、roots / operators / conditions / functions / projections / examples / errors へ分割する。",
    ],
    detail: [
      "help は 1 回に全量を返さず、現在 topic の本体と関連 2 から 4 件だけを返す。",
      "CLI、MCP、VSIX は同じ help graph を共有し、呼び出し形だけを変える。",
      "parse error 時は全文再掲ではなく、対応する quick reference と関連 topic への導線を返す。",
    ],
    index: [
      { key: "syntax", label: "syntax", summary: "top-level block、step 記法、各 statement の基本文法" },
      { key: "query", label: "query", summary: "DSLQL の root、operator、関数、代表 query" },
      { key: "usecases", label: "usecases", summary: "目的別の逆引き query テンプレート" },
      { key: "samples", label: "samples", summary: "論理 sample id から具体例と現在環境での配置を辿る" },
      { key: "channels", label: "channels", summary: "CLI / MCP / VSIX からの呼び出し方法" },
    ],
    related: ["query", "usecases", "samples"],
  },
  {
    key: "syntax",
    title: "Syntax Index",
    summary: "DSL の top-level block と各 statement の基本文法。",
    quick: [
      "top-level では framework / domain / problem / step / query に加え、statement role を直接置く flatten 記法も使える。",
      "step は `step S1:`、`step:`、`evidence EV1:` の 3 形を受理する。",
      "text-bearing field は 1 行 quoted text か block text を使い分ける。",
      "query block の body は DSLQL 1 行式。",
    ],
    detail: [
      "problem や decision などの text-bearing field は quoted text か `|` marker 付き block text を取れる。",
      "statement role は premise / evidence / decision / comparison / pending / viewpoint / partition。",
      "decision based_on は任意だが、未指定 decision は監査対象になりうる。",
    ],
    index: [
      { key: "syntax.top-level", label: "top-level", summary: "framework / domain / problem / step / query の入口" },
      { key: "syntax.step", label: "step", summary: "explicit step、step:、flatten 記法" },
      { key: "syntax.decision", label: "decision", summary: "based_on を含む decision 文法" },
      { key: "syntax.annotations", label: "annotations", summary: "annotation kind と付与位置の使い分け" },
      { key: "syntax.comparison", label: "comparison", summary: "problem / viewpoint scope を持つ decision 比較文法" },
      { key: "syntax.query-block", label: "query-block", summary: "query 宣言と DSLQL body" },
    ],
    related: ["query", "usecases"],
  },
  {
    key: "syntax.top-level",
    title: "Top-Level Blocks",
    summary: "文書の上位に置ける block の一覧。",
    quick: [
      "framework Name",
      "domain DomainName:",
      "problem P1:",
      "step S1: / step: / flatten statement",
      "query Q1:",
    ],
    detail: [
      "framework は `requires / forbids / warns` rule を持てる。",
      "domain は `description \"...\"` または `description |` の block text を 1 つ持つ。",
      "query は 1 行の DSLQL expression を body に持つ。",
    ],
    examples: [
      "framework ReviewAudit:",
      "  requires problem and decision",
      "domain Review:",
      '  description "設計レビュー"',
      "problem P1:",
      '  "監査したい問題"',
      "problem P2:",
      "  |",
      "    長い説明を",
      "    複数行で書ける",
    ],
    exampleSamples: ["framework-requires-and"],
    related: ["syntax.step", "syntax.query-block"],
  },
  {
    key: "syntax.step",
    title: "Step Forms",
    summary: "step の明示/暗黙記法。",
    quick: [
      "`step S1:` は explicit step と explicit step id。",
      "`step:` は explicit step と synthetic step id。",
      "`evidence EV1:` のような top-level statement は implicit step。",
    ],
    detail: [
      "AST は常に StepDecl を持つ。step id が省略された場合は `S-${statement.id}` を内部補完する。",
      "formatter は explicit `step S1:`、`step:`、flatten の表記を保持する。",
      "based_on や query 参照の主 anchor は statement id。step id は構造位置の anchor。",
    ],
    examples: [
      "step S1:",
      "  premise PR1:",
      '    "explicit step id"',
      "",
      "step:",
      "  evidence EV1:",
      '    "synthetic step id"',
      "",
      "decision D1 based_on EV1:",
      '  "implicit step"',
    ],
    exampleSamples: ["decision-minimal"],
    related: ["syntax.decision", "query"],
  },
  {
    key: "syntax.annotations",
    title: "Annotation Syntax",
    summary: "annotation kind の閉じた集合と、problem / text-bearing statement への付与方法。",
    quick: [
      "annotation は `annotation kind:` の header と、その次行の quoted text か block text で書く。",
      "kind は explanation / rationale / status / caveat / todo / orphan_future / orphan_reference の閉じた集合。",
      "annotation は problem と premise / evidence / decision / comparison / pending に付けられる。",
    ],
    detail: [
      "explanation は補足説明、rationale は理由、status は rejected / negated / superseded のような状態タグ、caveat は制約、todo は後続作業に使う。",
      "orphan_future と orphan_reference は intentional orphan を明示するための kind で、preview や review で孤立ノードを意図的に残すときに使う。",
      "status は機械解釈する列挙値なので 1 行で保ち、複数行補足は rationale など別 annotation へ分ける。",
      "kind 名は自由入力ではない。未知の kind は parse error になるので、この topic で閉じた集合を確認してから選ぶ。",
    ],
    examples: [
      "problem P1:",
      '  "コメント導入方針を決める"',
      "  annotation rationale:",
      '    "自由コメントと意味付き注釈を分ける"',
      "",
      "step S1:",
      "  decision D1 based_on P1:",
      '    "annotation を第一級要素として採用する"',
      "    annotation status:",
      '      "superseded"',
      "    annotation orphan_reference:",
      '      "旧方針を参照用に残す"',
    ],
    exampleSamples: ["framework-contract", "contradiction-pending"],
    related: ["syntax.decision", "syntax.step", "samples"],
  },
  {
    key: "syntax.decision",
    title: "Decision Syntax",
    summary: "decision と based_on の基本構文。",
    quick: [
      "`decision D1:` は構文上は有効。",
      "`decision D1 based_on PR1, EV1:` のように based_on を comma 区切りで書ける。",
      "次行は quoted text か block text。",
    ],
    detail: [
      "based_on は declared problem id または statement id の列を参照する。",
      "根拠なし decision は parse error ではなく、監査で contract_violation 候補になる。",
      "decision text の後に annotation を並べられる。",
      "annotation status は rejected / negated / superseded のような状態タグを付ける用途に使える。",
      "annotation kind 全体の一覧と使い分けは `dsl help syntax annotations` を辿る。",
    ],
    examples: [
      "decision D1 based_on PR1, EV1:",
      '  "ADR を先に確定する"',
      "  annotation status:",
      '    "rejected"',
      "  annotation rationale:",
      '    "根拠を明示する"',
    ],
    exampleSamples: ["decision-minimal", "contradiction-pending"],
    related: ["syntax.annotations", "syntax.step", "query.functions", "usecases.decision-without-basis"],
  },
  {
    key: "syntax.comparison",
    title: "Comparison Syntax",
    summary: "同一 problem / viewpoint scope で decision 間の相対比較を記述する。",
    quick: [
      "`comparison CMP1 on P1 viewpoint VP1 relation preferred_over D1, D2:` の形を使う。",
      "relation は preferred_over / weaker_than / incomparable / counterexample_to の閉じた集合。",
      "次行は quoted text か block text で、比較理由や読み筋を補足する。",
    ],
    detail: [
      "comparison は global weight ではなく、problem と viewpoint を明示した局所比較として扱う。",
      "left/right decision は既存 decision id を参照する。",
      "counterexample_to は左側 decision が右側 decision への反例や反証として機能することを表す。優先順位の partial order には入れない。",
      "audit は未解決参照、scope 内 conflict、preference cycle を検査できる。",
    ],
    examples: [
      "comparison CMP1 on P1 viewpoint VP1 relation preferred_over D1, D2:",
      '  "cost では D1 を D2 より優先する"',
      "comparison CMP2 on P1 viewpoint VP1 relation counterexample_to D3, D1:",
      '  "D3 は D1 の前提を崩す反例になる"',
    ],
    exampleSamples: ["decision-comparison"],
    related: ["syntax.decision", "syntax.step", "samples.decision-comparison"],
  },
  {
    key: "syntax.query-block",
    title: "Query Block",
    summary: "query 宣言の形と DSLQL body の入口。",
    quick: [
      "`query Q1:` の次の indented line に DSLQL を 1 行で書く。",
      "body は field access、pipe、select、projection、relation function を組み合わせる。",
      "まずは `.problems[] | select(.id == \"P1\") | related_decisions` を基準形にする。",
    ],
    detail: [
      "query body は当面 1 行固定。複数行 pipeline は未導入。",
      "query expression は parser 上 string のまま保持し、DSLQL evaluator が解釈する。",
      "query 詳細は `dsl help query` から辿る。",
    ],
    examples: [
      "query Q1:",
      '  .problems[] | select(.id == "P1") | related_decisions',
    ],
    exampleSamples: ["query-assist", "query-unresolved"],
    related: ["query", "query.examples", "usecases.problem-to-decision"],
  },
  {
    key: "query",
    title: "Query Index",
    summary: "DSLQL の root schema、operator、function、代表例への入口。",
    quick: [
      "query は root を stream として辿り、pipe で絞り込みをつなぐ。",
      "最初に覚えるのは `.problems[]`、`select(...)`、`related_decisions`。",
      "困ったら examples か usecases から逆引きする。",
    ],
    detail: [
      "query には syntax より専用 index を用意し、概念ごとに小さく分割する。",
      "roots は `.problems` / `.steps` / `.audit` / `.search` の入口。",
      "functions は relation-aware helper をまとめる。",
    ],
    index: [
      { key: "query.roots", label: "roots", summary: "`.problems`、`.steps`、`.audit`、`.search` の意味" },
      { key: "query.operators", label: "operators", summary: "pipe、select、map、sort_by、limit、unique_by" },
      { key: "query.conditions", label: "conditions", summary: "比較、and/or/not、contains、starts_with" },
      { key: "query.functions", label: "functions", summary: "related_decisions、based_on_refs、audit_findings など" },
      { key: "query.projections", label: "projections", summary: "object projection と collect の使い方" },
      { key: "query.examples", label: "examples", summary: "代表 query のテンプレート" },
      { key: "query.errors", label: "errors", summary: "よくある迷い方と回復導線" },
    ],
    related: ["syntax.query-block", "usecases", "samples"],
  },
  {
    key: "query.roots",
    title: "Query Roots",
    summary: "DSLQL の開始点になる root schema。",
    quick: [
      "`.problems[]` は problem stream。",
      "`.steps[]` は正規化された step statement stream。",
      "`.audit` は latest audit result、`.search[]` は thought search result stream。",
    ],
    detail: [
      "`.steps[]` の各要素は `step_id`、`role`、`id`、`text`、`based_on` などの共通 field を持つ。",
      "problem から decision を辿るときは `.problems[]` を始点にする。",
      "監査結果の集計は `.audit` を始点にする。",
    ],
    examples: [
      '.problems[] | select(.id == "P1") | related_decisions',
      '.steps[] | select(.role == "decision")',
      '.audit | audit_findings("warning")',
    ],
    exampleSamples: ["query-assist"],
    related: ["query.functions", "query.examples"],
  },
  {
    key: "query.operators",
    title: "Query Operators",
    summary: "pipe と stream 操作の最小セット。",
    quick: [
      "`expr | expr` は左辺 stream を右辺へ流す。",
      "`select(cond)` は条件に合う要素だけ残す。",
      "`map(expr)`、`sort_by(expr)`、`limit(n)`、`unique_by(expr)` を組み合わせる。",
    ],
    detail: [
      "field 不在は empty として扱われ、stream から落ちる。",
      "`[expr]` は current stream を array に束ねる。",
      "operator 詳細より先に examples を見たほうが書き始めやすい場合が多い。",
    ],
    examples: [
      '.steps[] | select(.role == "decision") | sort_by(.score) | limit(2)',
      '.steps[] | select(.role == "decision") | map({id: .id, text: .text})',
    ],
    related: ["query.conditions", "query.projections", "query.examples"],
  },
  {
    key: "query.conditions",
    title: "Query Conditions",
    summary: "select 内で使う比較と論理演算。",
    quick: [
      "`==`, `!=`, `>`, `>=`, `<`, `<=` を使える。",
      "`and`, `or`, `not` で条件を組める。",
      "`contains(x)`、`starts_with(x)`、`ends_with(x)` を使える。",
    ],
    detail: [
      "role 判定は `.role == \"decision\"` の形が基準。",
      "problem id 指定は `.id == \"P1\"` の形。",
      "配列や text を含む条件は `contains(...)` を使う。",
    ],
    examples: [
      '.steps[] | select(.role == "decision" and len(.based_on) == 0)',
      '.search[] | select(contains(.id, "ADR"))',
    ],
    related: ["query.operators", "query.examples"],
  },
  {
    key: "query.functions",
    title: "Query Functions",
    summary: "llmthink 固有の relation-aware function。",
    quick: [
      "`related_decisions` は problem から decision を辿る。",
      "`based_on_refs` は decision の根拠 statement を返す。",
      "`audit_findings`、`has_open_pending`、`score`、`kind` を使える。",
    ],
    detail: [
      "`related_decisions` は problem または problem id を受け、decision stream を返す。",
      "`audit_findings(\"warning\")` は warning 以上の finding stream を返す。",
      "query 設計で迷ったら、まず root selection と relation function の 2 段に分けて考える。",
    ],
    examples: [
      '.problems[] | select(.id == "P1") | related_decisions',
      '.audit | audit_findings("warning") | [.] | {count: len(.), findings: .}',
      '.search[] | select(has_open_pending(.)) | sort_by(score(.)) | limit(10)',
    ],
    exampleSamples: ["query-assist", "query-unresolved"],
    related: ["query.roots", "query.examples", "usecases.problem-to-decision"],
  },
  {
    key: "query.projections",
    title: "Query Projections",
    summary: "map、object projection、collect の使い方。",
    quick: [
      "`map({id: .id, text: .text})` で整形できる。",
      "`[.]` で stream を 1 つの array に束ねる。",
      "集約前に `unique_by(.id)` を入れると重複を減らせる。",
    ],
    detail: [
      "object projection は各要素を軽量 view に変換する。",
      "collect の後は `len(.)` のような配列処理につなげられる。",
      "出力が長いときは projection を先に入れる。",
    ],
    examples: [
      '.steps[] | select(.role == "decision") | map({id: .id, text: .text})',
      '.audit | audit_findings("warning") | [.] | {count: len(.), findings: .}',
    ],
    related: ["query.operators", "query.examples"],
  },
  {
    key: "query.examples",
    title: "Query Examples",
    summary: "よく使う query の雛形。",
    quick: [
      "problem から decision を辿る。",
      "根拠のない decision を探す。",
      "open pending を持つ thought を絞り込む。",
    ],
    detail: [
      "examples はそのまま使うより、まず root と relation を読み取ってから自分の id に置き換える。",
      "出力が多い場合は projection や limit を最後に足す。",
      "逆引きしたいときは `dsl help usecases` を使う。",
    ],
    examples: [
      '.problems[] | select(.id == "P1") | related_decisions | {id: .id, text: .text, based_on: .based_on}',
      '.steps[] | select(.role == "decision" and len(.based_on) == 0)',
      '.search[] | select(has_open_pending(.)) | sort_by(score(.)) | limit(10)',
    ],
    exampleSamples: ["query-assist", "query-unresolved", "dsl-samples"],
    related: ["usecases", "query.functions", "query.projections"],
  },
  {
    key: "query.errors",
    title: "Query Troubleshooting",
    summary: "query が書けないときの見直し順。",
    quick: [
      "まず root が正しいか確認する。problem 起点なら `.problems[]`、statement 起点なら `.steps[]`。",
      "次に select 条件の id や role を確認する。",
      "最後に relation function と projection を足す。",
    ],
    detail: [
      "field access と relation function を一度に混ぜず、root -> select -> relation -> projection の順で組むと崩れにくい。",
      "query 断片より逆引きが欲しいなら usecases topic を使う。",
      "parse error 時の quick reference からもこの topic へ戻れるようにする。",
    ],
    examples: [
      'query Q1:\n  .problems[] | select(.id == "P1") | related_decisions',
      'query Q2:\n  .steps[] | select(.role == "decision")',
    ],
    exampleSamples: ["query-unresolved", "query-assist"],
    related: ["query.roots", "query.functions", "usecases"],
  },
  {
    key: "samples",
    title: "Sample Index",
    summary: "論理 sample id から具体例と現在環境での配置を辿る。",
    quick: [
      "sample は固定パスではなく logical id で案内する。",
      "現在の checkout に sample が存在する場合だけ resolved path を表示する。",
      "詳細は `dsl help samples <sample-id> detail` で辿る。",
    ],
    detail: [
      "配布形態によって docs/examples の位置や同梱有無が変わるため、help は sample id を主 anchor にする。",
      "resolved path は補助情報であり、存在しない場合でも sample id と summary は安定して使える。",
    ],
    index: listDslExamples().map((entry) => ({
      key: `samples.${entry.id}`,
      label: entry.id,
      summary: entry.summary,
    })),
    related: ["query.examples", "channels"],
  },
  {
    key: "usecases",
    title: "Use Case Index",
    summary: "目的文や思考 profile から query テンプレートと代表例へ逆引きする入口。",
    quick: [
      "query 文法ではなく、やりたいことから辿りたいときの入口。",
      "迷ったら usecase profile を選び、最小 role、alias、関連 query を見る。",
    ],
    detail: [
      "usecase は query examples より目的主導で、最小 role、alias、関連 reference を返す。",
      "LLM には usecase の短いテンプレートを返し、人間には see also を付ける。",
    ],
    index: [
      { key: "usecases.ideation", label: "ideation", summary: "発散 -> 収束 -> クラスタ化 -> ラベル -> 結論を既存 role で記述したい" },
      { key: "usecases.problem-solving", label: "problem-solving", summary: "課題解決・問題解決の最小 role を知りたい" },
      { key: "usecases.other-profiles", label: "other-profiles", summary: "その他ユースケースを representative profile で見たい" },
      { key: "usecases.problem-to-decision", label: "problem-to-decision", summary: "problem から関連 decision を出したい" },
      { key: "usecases.decision-without-basis", label: "decision-without-basis", summary: "根拠のない decision を探したい" },
      { key: "usecases.open-pending", label: "open-pending", summary: "pending を含む thought を探したい" },
      { key: "usecases.audit-findings", label: "audit-findings", summary: "warning 以上の finding を集計したい" },
    ],
    related: ["query.examples", "query.functions"],
  },
  {
    key: "usecases.ideation",
    title: "Use Case: Ideation Support",
    summary: "発散、収束、クラスタ化、ラベル付け、結論化を既存 role で表す。",
    quick: [
      "最小 role は `problem`、`premise` または `evidence`、`viewpoint`、`partition`、`decision`、`pending`。",
      "`premise` / `evidence` は idea seed、`partition` は cluster、`decision` は conclusion と読める。",
    ],
    detail: [
      "発散段階では premise や evidence を seed 候補として並べる。",
      "収束とラベル付けは viewpoint と partition を使って cluster を明示する。",
      "採用しなかった枝や次回候補は pending に残す。",
    ],
    examples: [
      'problem P1:\n  "次に検討する案を整理したい"',
      'viewpoint VP1:\n  axis activation',
      'partition PT1 on Ideation axis activation:\n  Guided := guided_entry\n  Checklist := checklist_entry\n  Others := not Guided and not Checklist',
      'decision D1 based_on P1, PR1, EV1:\n  "guided entry を中心案として収束する"',
    ],
    exampleSamples: ["ideation-profile"],
    related: ["syntax.step", "syntax.decision", "query.examples"],
  },
  {
    key: "usecases.problem-solving",
    title: "Use Case: Problem Solving",
    summary: "課題解決・問題解決を最小 role で追う。",
    quick: [
      "最小 role は `problem`、`premise`、`evidence`、`decision`、`pending`。",
      "必要なら `viewpoint` や `partition` を追加して比較軸や分類を明示する。",
    ],
    detail: [
      "まず problem で解く対象を固定し、premise で制約や前提を置く。",
      "evidence を積んで decision へ接続し、未解決は pending に残す。",
      "複数解法を比較する場合だけ viewpoint や partition を追加する。",
    ],
    examples: [
      'problem P1:\n  "nightly build failure を止めたい"',
      'premise PR1:\n  "失敗は CI 上で再現する"',
      'decision D1 based_on P1, PR1, EV1:\n  "dependency cache invalidation を先に試す"',
    ],
    exampleSamples: ["problem-solving-profile"],
    related: ["usecases.problem-to-decision", "usecases.open-pending", "syntax.decision"],
  },
  {
    key: "usecases.other-profiles",
    title: "Use Case: Other Profiles",
    summary: "その他ユースケースは syntax 追加ではなく representative profile を段階追加する。",
    quick: [
      "設計レビュー、比較検討、計画整理、振り返りなどを profile と example で増やす。",
      "alias は parser keyword ではなく docs/help 上の説明語として扱う。",
    ],
    detail: [
      "AST、audit、preview、query の role 名は固定し、usecase ごとの差分は guidance で吸収する。",
      "既存 role では表現しきれない差分が確認されるまで、新しい statement role は追加しない。",
    ],
    examples: [
      "design review: problem / premise / evidence / decision / pending",
      "planning: problem / premise / partition / decision / pending",
      "retrospective: problem / evidence / decision / pending",
    ],
    related: ["usecases.ideation", "usecases.problem-solving", "samples"],
  },
  {
    key: "usecases.problem-to-decision",
    title: "Use Case: Problem to Decision",
    summary: "problem から関連 decision を辿る。",
    quick: [
      '`.problems[] | select(.id == "P1") | related_decisions` を起点にする。',
      "最後に projection を足すと読みやすい。",
    ],
    detail: [
      "problem id を絞ってから `related_decisions` を呼ぶ。",
      "decision text や based_on を見たいなら object projection を足す。",
    ],
    examples: [
      '.problems[] | select(.id == "P1") | related_decisions | {id: .id, text: .text, based_on: .based_on}',
    ],
    exampleSamples: ["query-assist"],
    related: ["query.functions", "query.projections", "syntax.query-block"],
  },
  {
    key: "usecases.decision-without-basis",
    title: "Use Case: Decision Without Basis",
    summary: "根拠参照がない decision を探す。",
    quick: [
      '`.steps[] | select(.role == "decision" and len(.based_on) == 0)` を使う。',
      "監査前の自己チェック用に向いている。",
    ],
    detail: [
      "`.steps[]` は normalized statement stream。",
      "role 判定と based_on 長さ判定を組み合わせる。",
    ],
    examples: [
      '.steps[] | select(.role == "decision" and len(.based_on) == 0)',
    ],
    exampleSamples: ["decision-minimal", "contradiction-pending"],
    related: ["query.conditions", "syntax.decision"],
  },
  {
    key: "usecases.open-pending",
    title: "Use Case: Open Pending",
    summary: "pending を含む thought を検索結果から絞り込む。",
    quick: [
      '`.search[] | select(has_open_pending(.)) | sort_by(score(.)) | limit(10)` を使う。',
      "search result の ranking score を最後に使う。",
    ],
    detail: [
      "persisted thought search を前提に `.search[]` を root にする。",
      "`has_open_pending` と `score` は llmthink 固有関数。",
    ],
    examples: [
      '.search[] | select(has_open_pending(.)) | sort_by(score(.)) | limit(10)',
    ],
    related: ["query.functions", "query.operators"],
  },
  {
    key: "usecases.audit-findings",
    title: "Use Case: Audit Findings",
    summary: "warning 以上の監査結果を集約する。",
    quick: [
      '`.audit | audit_findings("warning") | [.] | {count: len(.), findings: .}` を使う。',
      "collect の後で件数と配列をまとめて返す。",
    ],
    detail: [
      "`.audit` は latest audit result の root。",
      "severity 閾値は `audit_findings(...)` に渡す。",
    ],
    examples: [
      '.audit | audit_findings("warning") | [.] | {count: len(.), findings: .}',
    ],
    exampleSamples: ["query-assist-audit", "audit-output-sample"],
    related: ["query.functions", "query.projections"],
  },
  {
    key: "channels",
    title: "Channel Index",
    summary: "CLI / MCP / VSIX tool から help を辿る方法。",
    quick: [
      "CLI は `llmthink dsl help [topic] [subtopic] [detail]`。",
      "MCP は `dsl action=help` に topic / subtopic / detail を渡す。",
      "VSIX tool も同じ論理引数を受ける。",
    ],
    detail: [
      "チャネルごとに表示形式は違っても、help graph 自体は共通。",
      "topic だけを先に問い合わせ、必要なら subtopic へ進むのが基本。",
    ],
    index: [
      { key: "channels.cli", label: "cli", summary: "コマンドラインからの使い方" },
      { key: "channels.mcp", label: "mcp", summary: "MCP tool 引数としての使い方" },
      { key: "channels.vsix", label: "vsix", summary: "VSIX language model tool と dsl help text の使い方" },
    ],
    related: ["overview", "query", "samples"],
  },
  {
    key: "channels.cli",
    title: "CLI Help",
    summary: "CLI で topic/subtopic/detail を辿る。",
    quick: [
      "`llmthink dsl help` で索引。",
      "`llmthink dsl help query` で query index。",
      "`llmthink dsl help query functions detail` で詳細。",
    ],
    detail: [
      "topic だけなら index、subtopic まで入れると quick reference、末尾 `detail` で詳細。",
      "出力が長いときは topic を細かく分けて再問い合わせする。",
    ],
    related: ["query", "channels.mcp", "channels.vsix"],
  },
  {
    key: "channels.mcp",
    title: "MCP Help",
    summary: "MCP dsl tool の action=help 引数。",
    quick: [
      "`dsl action=help topic=query` で query index。",
      "`dsl action=help topic=query subtopic=functions detail=detail` で詳細。",
      "channel は自動的に MCP 前提の導線を返す。",
    ],
    detail: [
      "MCP では dslText を渡さず action=help を使う。",
      "topic/subtopic/detail は省略可。",
    ],
    related: ["channels.cli", "channels.vsix", "query"],
  },
  {
    key: "channels.vsix",
    title: "VSIX Tool Help",
    summary: "VSIX language model tool から help を辿る。",
    quick: [
      "tool input では `action=help` に topic/subtopic/detail を渡せる。",
      "自由文 DSL では `dsl help query functions` のような text でも解決できる。",
      "LLM が使う場合も 1 回の応答量は topic 単位に抑える。",
    ],
    detail: [
      "tool input と plain text request の両方を同じ parser で解決する。",
      "まず query index を出し、その後 functions や examples に降りるのが安全。",
    ],
    related: ["channels.cli", "query", "usecases"],
  },
];

const HELP_LOOKUP = new Map<string, HelpNode>();
const SAMPLE_HELP_NODES: HelpNode[] = listDslExamples().map((entry) => ({
  key: `samples.${entry.id}`,
  title: `Sample: ${entry.id}`,
  summary: entry.summary,
  quick: [
    `sample id は ${entry.id}。`,
    "help では sample id を主 anchor とし、固定パスは補助表示に留める。",
  ],
  detail: [
    `元の相対配置は ${entry.path}。`,
    "現在の checkout に sample が存在する場合だけ resolved path が表示される。",
    "sample を利用する側は path 文字列ではなく id と summary を保持すると配布形態差異に強い。",
  ],
  exampleSamples: [entry.id],
  related: ["samples", "query.examples", "syntax.query-block"],
}));

for (const node of [...HELP_NODES, ...SAMPLE_HELP_NODES]) {
  HELP_LOOKUP.set(node.key, node);
}

function normalizeSegment(value: string | undefined): string | undefined {
  return value?.trim().toLowerCase().replaceAll("_", "-");
}

function inferDetail(request: DslHelpRequest): DslHelpDetail {
  if (request.detail) {
    return request.detail;
  }
  if (request.topic && request.subtopic) {
    return "quick";
  }
  return "index";
}

function helpNodeKey(topic?: string, subtopic?: string): string {
  const normalizedTopic = normalizeSegment(topic);
  const normalizedSubtopic = normalizeSegment(subtopic);
  if (!normalizedTopic) {
    return "overview";
  }
  if (!normalizedSubtopic) {
    return normalizedTopic;
  }
  return `${normalizedTopic}.${normalizedSubtopic}`;
}

function resolveHelpNode(request: DslHelpRequest): HelpNode {
  const key = helpNodeKey(request.topic, request.subtopic);
  return (
    HELP_LOOKUP.get(key) ??
    HELP_LOOKUP.get(normalizeSegment(request.topic) ?? "") ??
    HELP_LOOKUP.get("overview")!
  );
}

function startsWithAny(message: string, patterns: string[]): boolean {
  return patterns.some((pattern) => message.startsWith(pattern));
}

function formatCodeBlock(lines: string[]): string[] {
  return ["```llmthink", ...lines, "```"];
}

function helpInvocationExamples(node: HelpNode, request: DslHelpRequest): string[] {
  const detail = inferDetail(request);
  const topic = node.key.split(".")[0] ?? "overview";
  const subtopic = node.key.includes(".") ? node.key.split(".")[1] : undefined;
  const cli = [
    "llmthink dsl help",
    topic !== "overview" ? topic : undefined,
    subtopic,
    detail !== "index" ? detail : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  const mcpParts = [
    "dsl action=help",
    topic !== "overview" ? `topic=${topic}` : undefined,
    subtopic ? `subtopic=${subtopic}` : undefined,
    detail !== "index" ? `detail=${detail}` : undefined,
  ].filter(Boolean);
  const vsix = [
    "tool: action=help",
    topic !== "overview" ? `topic=${topic}` : undefined,
    subtopic ? `subtopic=${subtopic}` : undefined,
    detail !== "index" ? `detail=${detail}` : undefined,
  ].filter(Boolean);
  return [
    `- CLI: ${cli}`,
    `- MCP: ${mcpParts.join(" ")}`,
    `- VSIX: ${vsix.join(" ")}`,
  ];
}

function formatRelatedIndex(request: DslHelpRequest, node: HelpNode): string[] {
  const maxRelated = Math.max(2, Math.min(request.maxRelated ?? 3, 4));
  const relatedNodes = (node.related ?? [])
    .map((key) => HELP_LOOKUP.get(key))
    .filter((candidate): candidate is HelpNode => Boolean(candidate))
    .slice(0, maxRelated);

  if (relatedNodes.length === 0) {
    return [];
  }

  return [
    "Related Index",
    ...relatedNodes.map((related) => `- ${related.key}: ${related.summary}`),
    "",
  ];
}

function formatIndex(node: HelpNode): string[] {
  if (!node.index || node.index.length === 0) {
    return [];
  }
  return [
    "Index",
    ...node.index.map((entry) => `- ${entry.label}: ${entry.summary}`),
    "",
  ];
}

function formatQuickReference(node: HelpNode): string[] {
  return [
    "Quick Reference",
    ...node.quick.map((line) => `- ${line}`),
    "",
  ];
}

function formatDetailReference(node: HelpNode): string[] {
  return [
    "Detail Reference",
    ...node.detail.map((line) => `- ${line}`),
    ...(node.examples && node.examples.length > 0
      ? ["", "Examples", ...formatCodeBlock(node.examples)]
      : []),
    "",
  ];
}

function formatExampleSamples(node: HelpNode): string[] {
  if (!node.exampleSamples || node.exampleSamples.length === 0) {
    return [];
  }
  const entries = listDslExamples(node.exampleSamples);
  return [
    "Example Samples",
    ...entries.flatMap((entry) => {
      const resolvedPath = resolveDslExamplePath(entry.id);
      return [
        `- ${entry.id}: ${entry.summary}`,
        `  help: llmthink dsl help samples ${entry.id} detail`,
        resolvedPath
          ? `  resolved_path: ${resolvedPath}`
          : "  resolved_path: unavailable in current distribution",
      ];
    }),
    "",
  ];
}

export function parseDslHelpRequest(input: string): DslHelpRequest | undefined {
  const tokens = input.trim().split(/\s+/u).filter(Boolean);
  if (tokens[0]?.toLowerCase() !== "dsl" || tokens[1]?.toLowerCase() !== "help") {
    return undefined;
  }

  const lastToken = normalizeSegment(tokens.at(-1));
  const detail =
    lastToken === "index" || lastToken === "quick" || lastToken === "detail"
      ? lastToken
      : undefined;
  return {
    topic: tokens[2],
    subtopic: detail
      ? tokens.length >= 5
        ? tokens[3]
        : undefined
      : tokens[3],
    detail,
  };
}

export function isDslHelpRequest(input: string): boolean {
  return Boolean(parseDslHelpRequest(input));
}

export function getDslSyntaxGuidanceText(request: DslHelpRequest = {}): string {
  const node = resolveHelpNode(request);
  const detail = inferDetail(request);
  const lines: string[] = [
    HELP_HEADER,
    "",
    `Topic: ${node.key}`,
    `View: ${detail}`,
    "",
    node.summary,
    "",
  ];

  if (detail === "index") {
    lines.push(...formatIndex(node));
    lines.push(...formatQuickReference(node));
  } else if (detail === "quick") {
    lines.push(...formatQuickReference(node));
    if (node.index?.length) {
      lines.push(...formatIndex(node));
    }
  } else {
    lines.push(...formatQuickReference(node));
    lines.push(...formatDetailReference(node));
  }

  lines.push(...formatExampleSamples(node));
  lines.push(...formatRelatedIndex(request, node));
  lines.push("Next Requests", ...helpInvocationExamples(node, request));
  return `${lines.join("\n")}\n`;
}

const PARSE_ERROR_HELP_RULES: ParseErrorHelpRule[] = [
  {
    matches: (message) => startsWithAny(message, ["Unexpected top-level statement:"]),
    help: {
      rationale:
        "top-level では framework / domain / problem / step / query に加えて premise / evidence / pending / viewpoint / partition / decision も許可される。",
      expectedSyntax: [
        "framework ReviewAudit",
        "domain DesignReview:",
        '  description "..."',
        "problem P1:",
        '  "..."',
        "evidence EV1:",
        '  "..."',
        "query Q1:",
        '  .problems[] | select(.id == "P1") | related_decisions',
      ].join("\n"),
    },
  },
  {
    matches: (message) => startsWithAny(message, ["Invalid framework declaration"]),
    help: {
      rationale:
        "framework は 'framework Name' または 'framework Name:' で始める必要がある。",
      expectedSyntax: [
        "framework ReviewAudit",
        "framework ReviewAudit:",
        "  requires problem",
      ].join("\n"),
    },
  },
  {
    matches: (message) =>
      startsWithAny(message, ["Invalid domain declaration", "Domain description is required"]),
    help: {
      rationale: "domain は header 行の次に description 行を持つ。",
      expectedSyntax: ["domain DesignReview:", '  description "設計レビュー論点"', "  description |", "    複数行の説明"].join("\n"),
    },
  },
  {
    matches: (message) =>
      startsWithAny(message, ["Invalid problem declaration", "Problem text is required"]),
    help: {
      rationale: "problem は header 行の次に quoted text または `|` marker 付き block text を持つ。",
      expectedSyntax: ["problem P1:", '  "監査したい問題文"', "problem P2:", "  |", "    複数行の問題文"].join("\n"),
    },
  },
  {
    matches: (message) => startsWithAny(message, ["Invalid step declaration"]),
    help: {
      rationale:
        "step は 'step StepId:' または 'step:' で始める。あるいは step 自体を省略して statement を top-level に直接置ける。",
      expectedSyntax: ["step:", "  evidence EV1:", '    "根拠"'].join("\n"),
    },
  },
  {
    matches: (message) => startsWithAny(message, ["Unknown statement type"]),
    help: {
      rationale:
        "step の直下、または top-level の implicit step では premise / evidence / pending / viewpoint / partition / decision だけが許可される。",
      expectedSyntax: ["premise PR1:", '  "前提"'].join("\n"),
    },
  },
  {
    matches: (message) =>
      startsWithAny(message, ["Invalid premise declaration", "premise text is required"]),
    help: {
      rationale: "premise は 'premise Id:' の次に quoted text または block text を持つ。",
      expectedSyntax: ["step S1:", "  premise PR1:", '    "現在の前提"', "  premise PR2:", "    |", "      複数行の前提"].join("\n"),
    },
  },
  {
    matches: (message) =>
      startsWithAny(message, ["Invalid evidence declaration", "evidence text is required"]),
    help: {
      rationale: "evidence は 'evidence Id:' の次に quoted text または block text を持つ。",
      expectedSyntax: ["step S1:", "  evidence EV1:", '    "観測事実"', "  evidence EV2:", "    |", "      複数行の観測"].join("\n"),
    },
  },
  {
    matches: (message) =>
      startsWithAny(message, ["Invalid pending declaration", "pending text is required"]),
    help: {
      rationale: "pending は 'pending Id:' の次に quoted text または block text を持つ。",
      expectedSyntax: ["step S1:", "  pending PD1:", '    "未確定事項"', "  pending PD2:", "    |", "      複数行の未確定事項"].join("\n"),
    },
  },
  {
    matches: (message) =>
      startsWithAny(message, ["Invalid viewpoint declaration", "Viewpoint axis is required"]),
    help: {
      rationale: "viewpoint は 'viewpoint Id:' の次に 'axis name' を持つ。",
      expectedSyntax: ["step S1:", "  viewpoint VP1:", "    axis cost"].join("\n"),
    },
  },
  {
    matches: (message) =>
      startsWithAny(message, ["Invalid partition declaration", "Invalid partition member"]),
    help: {
      rationale:
        "partition は on/axis を含む header と、4 space 相当で始まる member 行を持つ。",
      expectedSyntax: [
        "step S1:",
        "  partition PT1 on ReviewDomain axis cost:",
        "    Cheap := cost < 100",
        "    Others := not Cheap",
      ].join("\n"),
    },
  },
  {
    matches: (message) =>
      startsWithAny(message, ["Invalid annotation declaration", "Annotation text is required"]),
    help: {
      rationale:
        "annotation は閉じた kind 集合を持ち、header 行の次に quoted text または block text を置く。kind 名が未知だったり本文が無い場合は annotation 自体の構文を見直す。",
      expectedSyntax: [
        "problem P1:",
        '  "監査したい問題文"',
        "  annotation rationale:",
        '    "背景と判断理由"',
        "  annotation explanation:",
        "    |",
        "      複数行の補足説明",
      ].join("\n"),
    },
  },
  {
    matches: (message) =>
      startsWithAny(message, ["Invalid decision declaration", "Decision text is required"]),
    help: {
      rationale:
        "decision は 'decision Id based_on Ref1, Ref2:' の形式で、次行に quoted text または block text を持つ。",
      expectedSyntax: [
        "step S1:",
        "  decision D1 based_on PR1, EV1:",
        '    "ADR を先に確定する"',
        "  decision D2 based_on PR1:",
        "    |",
        "      複数行の判断文",
      ].join("\n"),
    },
  },
  {
    matches: (message) =>
      startsWithAny(message, ["Invalid query declaration", "Query expression is required"]),
    help: {
      rationale: "query は 'query Id:' の次に expression を持つ。DSLQL の詳細は query help を辿る。",
      expectedSyntax: [
        "query Q1:",
        '  .problems[] | select(.id == "P1") | related_decisions',
      ].join("\n"),
    },
  },
];

function parseErrorHelp(error: ParseError): ParseErrorHelp {
  for (const rule of PARSE_ERROR_HELP_RULES) {
    if (rule.matches(error.message)) {
      return rule.help;
    }
  }

  return {
    rationale:
      "DSL の header、indent、quoted text の位置が期待形とずれている可能性がある。",
    expectedSyntax: getDslSyntaxGuidanceText({ topic: "syntax", detail: "quick" }).trimEnd(),
  };
}

export function createDslGuidanceReport(documentId = "dsl-help"): AuditReport {
  const issue: AuditIssue = {
    issue_id: "ISSUE-001",
    category: "semantic_hint",
    severity: "info",
    target_refs: [{ ref_id: documentId }],
    message: "LLMThink DSL の文法ガイダンス。",
    rationale:
      "DSL と query を一度に全文表示するのではなく、topic / subtopic を辿る索引として使うための案内。",
    suggestion:
      "CLI では 'llmthink dsl help query'、MCP では dsl action=help topic=query、VSIX tool では action=help topic=query を使う。",
    metadata: {
      syntax_guidance: getDslSyntaxGuidanceText(),
      query_guidance: getDslSyntaxGuidanceText({ topic: "query" }),
      usecase_guidance: getDslSyntaxGuidanceText({ topic: "usecases" }),
    },
  };

  return {
    engine_version: ENGINE_VERSION,
    document_id: documentId,
    generated_at: new Date().toISOString(),
    summary: {
      fatal_count: 0,
      error_count: 0,
      warning_count: 0,
      info_count: 1,
      hint_count: 0,
    },
    results: [issue],
    query_results: [],
  };
}

export function createParseErrorReport(
  error: ParseError,
  documentId: string,
): AuditReport {
  const help = parseErrorHelp(error);
  const issue: AuditIssue = {
    issue_id: "ISSUE-001",
    category: "contract_violation",
    severity: "fatal",
    target_refs: [{ ref_id: documentId }],
    message: error.message,
    rationale: help.rationale,
    suggestion:
      "CLI では 'llmthink dsl help syntax' や 'llmthink dsl help query'、MCP/VSIX では action=help に topic を付けて局所ガイダンスを確認する。",
    metadata: {
      line: error.line,
      column: error.column,
      end_column: error.endColumn,
      expected_syntax: help.expectedSyntax,
      syntax_help:
        "llmthink dsl help / llmthink dsl help query / MCP dsl action=help topic=query / VSIX tool action=help topic=query",
      syntax_overview: getDslSyntaxGuidanceText({ topic: "syntax" }),
      query_overview: getDslSyntaxGuidanceText({ topic: "query" }),
    },
  };

  return {
    engine_version: ENGINE_VERSION,
    document_id: documentId,
    generated_at: new Date().toISOString(),
    summary: {
      fatal_count: 1,
      error_count: 0,
      warning_count: 0,
      info_count: 0,
      hint_count: 0,
    },
    results: [issue],
    query_results: [],
  };
}
