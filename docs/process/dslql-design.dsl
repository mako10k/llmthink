domain DSLQLDesign:
  description "DSLQL v2 の一貫性、対称性、網羅性を固定する"

problem P1:
  "query の構文、公開 AST、評価意味論をどう一つの契約にするか"

problem P2:
  "宣言参照、欠落値、複数値、関数呼出しの曖昧性をどう除くか"

problem P3:
  "document AST と relation 関数をどう欠落なく query runtime へ公開するか"

step S1:
  premise PR1:
    "DSLQL は jq 互換ではなく llmthink の構造検査と AST 操作を目的とする"

step S2:
  evidence EV1:
    |
      旧実装は in、文字列 predicate、list literal、複数 relation 関数を仕様へ列挙したが、
      parser または evaluator に実装していなかった

step S3:
  evidence EV2:
    |
      旧実装は required access と optional access を同じ empty とし、
      object field の複数結果を先頭一件へ暗黙縮退していた

step S4:
  evidence EV3:
    |
      旧実装は .id と文字列の比較を宣言参照と推測し、
      related_decisions は input problem を無視して全 decision を返していた

step S5:
  decision D1 based_on P1, PR1, EV1:
    |
      DSLQL v2 は全 node を kind と source range 付きの公開 union にし、
      parser、visitor、transformer、formatter、evaluator が同じ AST を使う

step S6:
  decision D2 based_on P2, EV2:
    |
      required path は欠落時に失敗させ、optional path だけを empty とし、
      object field は 0 または 1 値を要求して複数値の黙示的な損失を禁止する

step S7:
  decision D3 based_on P2, EV3:
    |
      宣言参照は @P1、関数呼出しは name() と明示し、
      静的参照抽出と runtime call を通常の文字列や bare identifier から分離する

step S8:
  decision D4 based_on P3, PR1, EV3:
    |
      runtime root は document、audit、thought、search の一階層だけを持ち、
      document は step と statement を分離した source AST の完全な正規形にする

step S9:
  decision D5 based_on P1, P3, EV1, EV3:
    |
      組み込み関数と relation 関数は仕様、補完、テストを同時に更新し、
      未知関数、arity 不一致、型不一致を empty ではなく評価エラーにする

step S10:
  pending PD1:
    "複数行 query body と query 専用 CLI は v2 core の安定後に別の受入基準で判断する"

step S11:
  evidence EV4:
    |
      llmthink は既に decision ranking と thought search で embedding を使うが、
      DSLQL v2 core は外部から渡された score の整列しか公開していなかった

step S12:
  decision D6 based_on P1, P3, EV4:
    |
      semantic query は similarity(left, right) を score、
      similar_to(left, right, threshold) を predicate、
      nearest_to(target[, threshold]) を stream ranking として分離する。
      非同期 runtime preparation 後の同期 evaluator は I/O を行わない

step S13:
  decision D7 based_on P2, EV4:
    |
      semantic match は node、score、provider、model を明示し、
      provider 無効や取得失敗を lexical または全候補へ暗黙 fallback しない

step S14:
  decision D8 based_on P1, P2, EV4:
    |
      embedding は一級オブジェクトの不可視属性とし、文字列リテラルだけを
      安全な遅延生成対象にする。動的な path や concat は生成上限を証明する
      optimizer が導入されるまで拒否する。distinct literal の既定上限は 8 とし、
      cache の温冷で許可判定を変えず、更新伝搬を要する semantic view は作らない
