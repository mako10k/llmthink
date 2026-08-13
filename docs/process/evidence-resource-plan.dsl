framework EvidenceResourceReview:
  requires problem and decision

domain EvidenceResource:
  description "Issue #5 の resource-backed evidence を後方互換かつ deterministic に導入する設計"

problem P1:
  "既存 evidence text と based_on 契約を壊さずに複数 resource を保持できる構造を決める"

problem P2:
  "URL、file、blob identity、integrity digest を曖昧にせず表現する"

problem P3:
  "構造検証と外部 resource の取得確認を分離し、audit の再現性と安全性を維持する"

problem P4:
  "resource の identity、参照可能性、DSLQL projection の境界を決める"

problem P5:
  "parser だけを拡張して他の公開 surface を不整合にしない受入条件を定める"

problem P6:
  "Issue #5 と resource embedding を分離し、保留中の Issue #6 を暗黙に実装しない"

step S1:
  evidence EV1:
    |
      Issue #5 は evidence に URL、file path、BLOB digest、mime type、label を持たせ、
      resource presence、scheme、metadata consistency を検証することを要求している

step S2:
  evidence EV2:
    |
      現行 EvidenceStatement は id、text、textBody、annotations、span だけを持つ。
      parser、formatter、DSLQL runtime、preview、LSP、Help はこの閉じた形を前提としている

step S3:
  premise PR1:
    |
      evidence は判断が based_on で参照する意味上の根拠であり、resource はその根拠の
      provenance または取得先を補足する payload とする。resource 自体を判断根拠へ昇格させない

step S4:
  premise PR2:
    |
      default audit は同じ文書と設定に対して再現可能であるべきで、URL fetch、file read、
      MIME sniff、digest verification のような外部 I/O を暗黙には実行しない

step S5:
  evidence EV3:
    |
      現行の DocumentDeclarationIndex は framework、domain、problem、step、statement、query の
      identified node を単一 global namespace に置き、@ID、definition、rename の authority としている

step S6:
  evidence EV4:
    |
      DSLQL は evidence を text-bearing statement として投影し、semantic query はその text を使う。
      resource の取得、抽出、caption、fingerprint を行う runtime capability は現行契約に存在しない

step S7:
  evidence EV5:
    |
      file document には document directory という安定した相対 path base があるが、--text、untitled、
      MCP payload には暗黙の base がない。process.cwd への fallback は実行場所で意味を変える

step S8:
  decision DA1 based_on P1, EV1, EV2:
    "evidence 直下へ url、file、digest、mime、label を一組だけ inline field として追加する"
    annotation status:
      "rejected"
    annotation rationale:
      |
        一つの evidence が複数資料を根拠にする場合を表せず、locator と metadata の繰り返し単位も
        不明瞭になるため、Issue #5 の最小構造としても拡張余地が不足する

step S9:
  decision DA2 based_on P1, P4, EV1, EV3:
    "resource を top-level identified declaration とし、evidence から ID 参照する"
    annotation status:
      "rejected"
    annotation rationale:
      |
        初期導入だけで global namespace、@ID、definition、rename、shared lifecycle を増やす。
        provenance payload を独立した意味ノードへ昇格させ、based_on の責務も曖昧にする

step S10:
  decision D1 based_on P1, EV1, EV2, PR1:
    |
      EvidenceStatement に resources を 0 個以上持たせ、既存 text は必須のまま維持する。
      resource は evidence 配下の匿名 structural value とし、最小構文を次の形にする。

      evidence EV1:
        "公開仕様を裏付ける根拠"
        resource:
          url "https://example.test/spec.pdf"
          digest "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
          mime "application/pdf"
          label "公開仕様"

      evidence は 0 個の resource なら従来と同じ意味を持つ。複数の resource block と annotation は
      evidence body 内で混在を受理し、formatter は resources、annotations の順へ正規化する

step S11:
  viewpoint VP1:
    axis backward_compatible_cardinality

step S12:
  comparison CMP1 on P1 viewpoint VP1 relation preferred_over D1, DA1:
    "D1 は既存 evidence を変えず、同じ evidence に 0..N 個の provenance payload を保持できる"

step S13:
  comparison CMP2 on P4 viewpoint VP1 relation preferred_over D1, DA2:
    "D1 は新しい declaration namespace や参照構文を導入せず Issue #5 の payload 要件を満たす"

step S14:
  decision D2 based_on P2, EV1:
    |
      resource は url、file、blob の tagged locator をちょうど一つ必須とする。
      url は absolute http または https URL、file は DSL source に記録する path、
      blob は content-addressed identity の sha256 digest とする。
      url と file には任意の integrity digest を付けられるが、blob と digest の併記は
      authority が重複するため拒否する

step S15:
  decision D3 based_on P2, D2:
    |
      digest と blob は初期版では sha256:<64 hex> のみを受理する。
      mime は parameter を含まない type/subtype、label は空でない表示用文字列とする。
      resource field は任意順で各一回だけ受理し、formatter は locator、digest、mime、label の順へ揃える。
      label は identity に使わず、mime は取得内容の真実ではなく記述者による metadata claim とする

step S16:
  decision D4 based_on P3, PR2, EV5:
    |
      Issue #5 の mandatory validation は I/O を伴わない structural validation とする。
      locator の一意性と存在、URL parse と scheme、file path の空値と NUL、digest 形式、mime 形式、
      duplicate field、blob と digest の矛盾を検査する。ここでいう resource presence は
      resource block に有効な locator が存在することであり、到達可能性ではない

step S17:
  decision D5 based_on P3, PR2, EV5, D4:
    |
      URL reachability、file existence、content digest、MIME sniff は明示的 resolver capability を持つ
      別フェーズへ分離する。file の相対 path を解決する場合は source document directory を使い、
      base を持たない --text、untitled、MCP payload は unknown として process.cwd へ fallback しない。
      absolute path と document directory 外への traversal は構造上保持できるが portability warning 候補とする

step S18:
  decision D6 based_on P4, PR1, EV3:
    |
      anonymous resource は DocumentDeclarationIndex に追加せず、@ID、based_on、definition、rename の
      対象にしない。decision は従来どおり evidence ID を参照する。DSLQL には evidence.resources[] の
      object value として locator_kind、locator、digest、mime、label、span を lossless に投影するが、
      新しい関数や semantic operand 規則は追加しない

step S19:
  decision D7 based_on P5, EV2, D1, D2, D3, D4, D6:
    |
      Issue #5 の実装 surface は AST、parser、formatter、public export、DSLQL document projection、
      analyzer structural rules、CLI Help、MCP Help、LSP hover と completion、TextMate syntax、preview、
      README、grammar、requirements、examples、tests、VSIX と dist の生成物までを一組とする。
      parser と formatter のみを完了条件にはしない

step S20:
  pending PD1:
    "named resource の共有と deduplication は実利用で同一 resource の反復が問題になった時点で再設計する"

step S21:
  pending PD2:
    "sha256 以外の digest algorithm は具体的な interoperability 要求が出るまで追加しない"

step S22:
  pending PD3:
    "resource-only evidence は evidence text の意味契約と embedding 対象が定まるまで許可しない"

step S23:
  decision D8 based_on P6, EV4, PD1, PD2, PD3:
    |
      Issue #5 では resource の自動取得、本文抽出、画像 caption、binary fingerprint、embedding、
      semantic view を実装しない。evidence の semantic text は従来の text のままとし、resource metadata の
      embedding 組み込みは Issue #6、named resource と resource-only evidence は別の明示判断へ残す

step S24:
  decision D9 based_on P5, D1, D2, D3, D4, D5, D6, D7, D8:
    |
      受入条件は既存 evidence fixture の parse と format が不変、0..N resource の round-trip、
      locator と metadata の正負例、default audit が resource I/O を行わないこと、base 不在時に cwd を
      使わないこと、resources projection の lossless 性、Help、LSP、preview、生成物の同期、
      repository の format、lint、test、audit が通ることとする

query Q1:
  .document.problems[] | select(.id == @P1) | related_decisions()

query Q2:
  .document.problems[] | select(.id == @P2) | related_decisions()

query Q3:
  .document.problems[] | select(.id == @P3) | related_decisions()

query Q4:
  .document.problems[] | select(.id == @P4) | related_decisions()

query Q5:
  .document.problems[] | select(.id == @P5) | related_decisions()

query Q6:
  .document.problems[] | select(.id == @P6) | related_decisions()
