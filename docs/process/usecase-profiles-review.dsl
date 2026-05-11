framework UsecaseProfilesReview:
  requires problem and decision
  requires evidence or premise or pending
  warns pending

domain ThoughtUsecaseProfiles:
  description |
    思考ユースケース別に必要要素を整理しつつ、DSL core を増やしすぎず、
    使用例と別名で吸収する方針が妥当かを整理する

problem P1:
  "発想支援、問題解決、その他の思考ユースケースを 1 つの DSL で扱いたいが、用途ごとに新しい statement role を増やすと複雑化しやすい"

problem P2:
  |
    同じ structure でもユースケースごとに呼びたい名前が違い、
    たとえば発想支援では evidence を idea seed、partition を cluster のように読み替えたい場面がある

problem P3:
  "ユースケースごとの違いを syntax で吸収しすぎると、help、audit、preview、query の全表面で alias と本名の二重管理が発生する"

problem P4:
  "それでも利用者には『この用途ではどの要素が最低限必要か』『どういう順で使うか』を逆引きできる導線が必要である"

step S1:
  premise PR1:
    |
      DSL の中心は thought structure の明示であり、ユースケースごとの用語差は
      core syntax より profile と examples で吸収したほうが単純である

step S2:
  premise PR2:
    "新しい第一級要素は、既存 role の組み合わせでは表現しきれない差分がある場合にだけ追加するべきである"

step S2A:
  premise PR3:
    "ユースケースごとの差分は、最低限必要な role の組み合わせと説明語を分けて整理したほうが、syntax と guidance の責務が混ざらない"

step S2B:
  premise PR4:
    "alias を parser keyword にしないなら、examples と help guidance を先に充実させるだけで利用感をかなり改善できる"

step S3:
  evidence EV1:
    |
      既存 core には problem、premise、viewpoint、partition、evidence、decision、pending があり、
      問題定義、仮説、評価軸、クラスタ、根拠、結論、保留をすでに分けられる

step S4:
  evidence EV2:
    "help system には usecases topic があり、目的別 guidance を syntax 追加なしで逆引き表示できる"

step S5:
  evidence EV3:
    |
      preview、query、audit は role 固定で組まれているため、
      ユースケース別 alias を syntax に入れるより表示層や examples で案内したほうが実装差分が小さい

step S6:
  evidence EV4:
    |
      発想支援の diverge -> converge -> cluster -> label -> decision も、problem、premise / evidence、
      viewpoint、partition、decision、pending の並びで近似できる

step S7:
  decision D1 based_on PR1, PR2, PR3, EV1, EV2, EV3:
    |
      ユースケース別の拡張は、新しい core statement role を増やすのではなく
      usecase profile と examples で吸収する方針を採用する

step S8:
  decision D2 based_on D1, EV4:
    |
      発想支援 profile の最小要素は、problem、premise または evidence、viewpoint、partition、
      decision、pending とする

step S9:
  decision D3 based_on D1, EV1:
    |
      課題解決・問題解決 profile の最小要素は、problem、premise、evidence、decision、pending とし、
      必要に応じて viewpoint / partition を追加する

step S10:
  decision D4 based_on PR3, EV1:
    |
      その他ユースケースは新 syntax で列挙せず、設計レビュー、比較検討、計画整理、振り返りなどの
      representative profile を examples と alias で段階的に追加する

step S11:
  decision D5 based_on PR4, EV2, EV3:
    |
      requirements には『usecase profile は existing role の最小組み合わせ、examples、alias guidance で提示する』
      という方針だけを追加し、syntax requirements は増やさない

step S12:
  decision D6 based_on D2, D3, D4:
    |
      alias は parser keyword ではなく help / docs 上の説明語として扱い、
      たとえば premise を hypothesis / seed、partition を cluster、decision を conclusion などと文脈別に案内する

step S13:
  pending PD1:
    "発想支援で premise と evidence のどちらを idea seed の既定役割に寄せるかは examples を見ながら後続で詰める必要がある"

step S14:
  pending PD2:
    "その他ユースケースの初期代表集合をどこまで requirements に書くかは docs の過密化を見て後続で調整が必要である"