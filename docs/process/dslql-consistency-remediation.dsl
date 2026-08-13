framework DSLQLConsistencyRemediationFramework:
  requires problem and decision

domain DSLQLConsistencyRemediation:
  description "DSLQL の一貫性、網羅性、対称性に関する原因解析と対策設計"

problem P1:
  "汎用 DSLQL evaluator の結果が文書監査では decision 候補へ暗黙縮退する"

problem P2:
  "宣言参照の名前空間と重複時の identity が subsystem ごとに異なる"

problem P3:
  "公開 AST を直接または transformer で操作した後の妥当性が保証されない"

problem P4:
  "関数契約の説明が Help、LSP、VSIX に重複し、実装からずれる"

problem P5:
  "破壊的な契約修正をどの順序と受入条件で導入するか"

step S1:
  premise PR1:
    |
      DSLQL v2 は document AST、audit、thought、search を読み取る汎用 Query Language であり、
      parser、visitor、transformer、formatter、evaluator が同じ AST 契約を共有する

step S2:
  premise PR2:
    |
      今回は旧契約との互換性より一貫性、網羅性、対称性を優先し、
      必要な破壊的変更を許容する

step S3:
  premise PR3:
    |
      similarity、similar_to、nearest_to、不可視 embedding、literal 予算 8、
      provider failure の fail-closed は独立レビューで整合しており維持する

step S4:
  evidence EV1:
    |
      evaluateDslqlExpression は任意の DslqlValue stream を返すが、Analyzer の QueryResult は
      ref_id を持つ decision item だけを表現し、その他の値を診断なしで破棄する。
      .document | has_open_pending() は evaluator で true になるが query_results は空になる

step S5:
  evidence EV2:
    |
      Analyzer の静的参照検査は problem と statement だけを宣言 ID とする一方、
      document runtime と LSP は framework、domain、step、query も ID 索引へ含める。
      domain Design は runtime では索引化されるが埋め込み query では未解決参照になる

step S6:
  evidence EV3:
    |
      runtime、semantic runtime、LSP は個別の Map に宣言を追加し、重複 ID を後勝ちで上書きする。
      現行 docs 32 文書には framework と domain が同じ ID を持つ例が 2 件あり、
      単一名前空間へ移行する場合は明示的な rename が必要である

step S7:
  evidence EV4:
    |
      parser は通常の number literal の有限性を検査するが、公開 transformer の出力を検証しない。
      NaN literal AST は formatter で null、evaluator で NaN となり、
      safe integer を超える index は parse と format の往復で別の整数になる

step S8:
  evidence EV5:
    |
      based_on_refs の実装は decision の based_on が指す problem または statement node を返すが、
      LSP hover は statement stream とだけ説明する。
      関数の signature と説明を subsystem ごとに手書きしているため drift を検出できない

step S9:
  decision D0 based_on P1, P2, P3, P4, EV1, EV2, EV3, EV4, EV5:
    |
      共通原因は、DSLQL core の一般化後も legacy decision ranking adapter、宣言索引、
      AST 正当性境界、関数 metadata がそれぞれ独立した契約所有者のまま残ったことである。
      個別の条件分岐や文言だけではなく、各境界に単一の canonical owner を置く

step S10:
  decision DA1 based_on P1, EV1:
    |
      文書内 query を decision-selection 専用 profile と定義し、
      decision 以外の結果を明示的な評価エラーにする
    annotation status:
      "rejected"
    annotation rationale:
      |
        document AST、audit、thought、search を読む汎用言語という親契約を狭め、
        同じ式が host API と文書内で異なる意味を持つため採用しない

step S11:
  decision D1 based_on P1, PR1, PR2, EV1:
    |
      文書内 query_result は evaluator が返した順序付き DslqlValue stream を values として
      lossless に保持する。decision の暗黙抽出、query 文面の embedding、heuristic score、
      rankDecisionsForQuery を廃止し、順位付けは明示した nearest_to だけが行う。
      表示上の件数制限は元の values を変えず、truncation を明示する presentation concern とする

step S12:
  viewpoint VP1:
    axis query_semantic_symmetry

step S13:
  comparison CMP1 on P1 viewpoint VP1 relation preferred_over D1, DA1:
    "D1 は同じ AST と evaluator に対して host API と文書内 query の出力意味を一致させる"

step S14:
  decision DA2 based_on P2, EV2, EV3:
    |
      framework、domain、problem、step、statement、query ごとに型別 ID 名前空間を維持し、
      型修飾 reference 構文を追加する
    annotation status:
      "rejected"
    annotation rationale:
      |
        現行の @ID は型を持たず、同じ表記の definition、rename、semantic target を
        subsystem ごとに推測させるため、v2 の単純な明示参照としては過剰である

step S15:
  decision D2 based_on P2, PR1, PR2, EV2, EV3:
    |
      framework、domain、problem、step、statement、query の全 identified node を対象に、
      単一 global namespace の DocumentDeclarationIndex を canonical owner とする。
      parser、Analyzer、document runtime、semantic resolver、LSP definition と rename は同じ索引を使い、
      重複 ID は索引利用前に fatal とする。semantic @ID は索引解決後に text-bearing でなければ
      semantic operand error とし、未解決参照とは区別する

step S16:
  viewpoint VP2:
    axis deterministic_identity

step S17:
  comparison CMP2 on P2 viewpoint VP2 relation preferred_over D2, DA2:
    "D2 は @ID の構文を増やさず definition、rename、evaluate、semantic target を一意にする"

step S18:
  decision DA3 based_on P3, EV4:
    "parser が生成する AST だけを検証し、手製 AST と transformer 出力は caller responsibility とする"
    annotation status:
      "rejected"
    annotation rationale:
      |
        DSLQL は AST レベル操作を公開目的に含むため、parser を通らない正規経路を
        未検証にすると format と evaluate の対称性を保証できない

step S19:
  decision D3 based_on P3, PR1, EV4:
    |
      validateDslqlAst を公開し、finite number、safe non-negative index、node category、operator、
      identifier、object field の一意性、range、cycle を検査する。
      parser は safe integer 外の index を構文エラーにし、visit、transform、format、evaluate、
      semantic preparation は公開 AST 境界で validator を共有する。transform は入力と出力を検証する

step S20:
  viewpoint VP3:
    axis ast_operation_safety

step S21:
  comparison CMP3 on P3 viewpoint VP3 relation preferred_over D3, DA3:
    "D3 は parser 由来と AST 操作由来の両方に同じ構造 invariant を課す"

step S22:
  decision DA4 based_on P4, EV5:
    "based_on_refs の hover 文言だけを修正する"
    annotation status:
      "rejected"
    annotation rationale:
      "現在の drift は直せるが、次の関数追加や signature 変更で同じ不整合が再発する"

step S23:
  decision D4 based_on P4, PR1, EV5:
    |
      name、category、arity、operand、result、semantic flag、summary を持つ
      DSLQLFunctionSpec registry を canonical metadata とする。
      evaluator runtime は実装 coverage、CLI と MCP Help、LSP hover と completion は説明 coverage、
      VSIX snippet と syntax は surface coverage をテストで registry と照合する。
      based_on_refs の出力説明は based_on の直接参照 node stream に統一する

step S24:
  viewpoint VP4:
    axis drift_prevention

step S25:
  comparison CMP4 on P4 viewpoint VP4 relation preferred_over D4, DA4:
    "D4 は現在の誤記修正に加えて将来の surface drift を機械的に検出する"

step S26:
  decision D5 based_on P5, PR3, D1, D2, D3, D4:
    |
      実装順は再現テスト固定、DocumentDeclarationIndex と重複拒否、AST validator、
      query_result values と暗黙 ranking 廃止、FunctionSpec registry、全 surface 再生成とする。
      各段階で parser、AST round-trip、runtime、semantic、Analyzer、LSP、CLI、MCP、VSIX、schema、
      examples の contract matrix を通し、既存 semantic 3 関数の受入条件を退行させない

step S27:
  decision D6 based_on D1:
    |
      QueryResult の items から values への破壊的 schema 変更は、まだ未公開の 1.0.0
      Unreleased 契約へ含める。package version は 1.0.0 のまま、changelog と仕様へ migration を記録する

step S28:
  decision D7 based_on D1:
    |
      Analyzer の raw query result は lossless とする。presentation 上限を適用したコピーだけが
      total_value_count と truncated true を返し、元 report を変更せず省略を明示する

step S29:
  decision D8 based_on D2:
    |
      global namespace 移行で既存 example 2 件の domain ID を rename する。
      user document の重複は first kind / line と duplicate kind / line を含む ParseError で修正位置を示す
