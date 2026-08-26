framework SqliteDriverSelection:
  requires problem and decision

domain HostedLifecycle:
  description "Issue #28 の SQLite driver と同時アクセス境界を決める"

problem P1:
  "Hosted lifecycle control plane で採用する SQLite driver と Node.js runtime 範囲を決める"

problem P2:
  "複数processまたはworkerが同じdatabaseへ接続した際のwriter競合をboundedかつatomicに扱う"

step S1:
  evidence EV1:
    |
      Node.js v24.19.0 はActive LTSで、node:sqlite はStability 1.2 Release Candidateである。
      DatabaseSyncは同期APIで、constructorのtimeoutがdatabase lockの最大待機時間を定義する

step S2:
  evidence EV2:
    |
      SQLite WALはreaderとwriterの並行実行を許すが、writerは同時に一つだけである。
      BEGIN IMMEDIATEはtransaction開始時にwrite lockを取得し、競合中はSQLITE_BUSYになり得る

step S3:
  evidence EV3:
    |
      現行実装はWAL、synchronous FULL、BEGIN IMMEDIATE、5000ms busy timeout、unique constraintを使い、
      別workerから同じidentityを同時provisionして一つのaccountだけがcommitされる試験を通している

step S4:
  evidence EV4:
    |
      Node.js v24.19.0を使ったisolated Stage試験は、二つの独立connectionの同時provisionを含む
      server test 101件中100件pass、real-restic 1件skip、失敗0件だった

step S5:
  premise PR1:
    |
      lifecycle databaseは低頻度で短いcontrol-plane transactionを扱い、thought本文や大容量mediaを
      保存しない。高頻度write workloadやnetwork filesystemはこの採択の前提に含めない

step S6:
  decision D1 based_on P1, EV1, EV3, EV4, PR1:
    |
      Hosted lifecycleのSQLite driverにはNode.js組込みのnode:sqliteを採用する。
      supported runtimeはNode.js >=24.15.0 <25とし、accepted Stage baselineを24.19.0に固定する。
      Node major変更またはnode:sqliteのStability後退は再評価gateとする

step S7:
  decision DA1 based_on P1, PR1:
    "better-sqlite3を現時点のdriverとして採用する"
    annotation status:
      "rejected"
    annotation rationale:
      |
        transactionとWALを扱える成熟した代替だが、現行のbounded workloadではnative addon、
        prebuilt binary、install script、Node ABI更新の運用負担を追加する便益が確認できない

step S8:
  decision DA2 based_on P1, PR1:
    "network databaseへ移行する"
    annotation status:
      "rejected"
    annotation rationale:
      |
        複数host writerや高write量の要件はなく、現段階ではnetwork、credential、migration、
        failure modeを増やす。SQLiteの単一writer上限に達した実測を再提案条件とする

step S9:
  decision D2 based_on P2, EV2, EV3, PR1:
    |
      各connectionはWAL、synchronous FULL、foreign keys、defensive設定、extension無効を使う。
      write transactionはBEGIN IMMEDIATEで開始し、5000msを上限にSQLite busy handlerへ待機を任せる。
      application-levelのblind retryは0回とし、timeout時は安定したbusy errorでfail closedにする。
      callerがoperation全体を再実行する場合は既存のidempotency keyとunique constraintを利用する

step S10:
  decision D3 based_on P2, D2, EV3:
    |
      受入試験は同一identityの同時初回provisionがexactly one commitになることに加え、別connectionが
      write lockを上限より長く保持した場合にloserがbounded busy errorを返し、partial rowを残さず、
      lock解放後の明示再実行が成功することを検証する

step S11:
  pending PD1:
    |
      Production activation、複数host writer、長時間transaction、継続的なSQLITE_BUSY、WAL肥大、
      event-loop遅延が観測された場合はdriverまたはdatabase architectureを別ADRで再評価する

step S12:
  decision D4 based_on P1, P2, D1, D2, D3, PD1:
    |
      Issue #28の完了はdriver採択、runtime gate、同時アクセス試験、backup/restoreと全回帰試験の通過までとする。
      この判断はProduction activation、public enrollment、billing、thought contentのSQLite移行を許可しない

query Q1:
  .document.problems[] | select(.id == @P1) | related_decisions()

query Q2:
  .document.problems[] | select(.id == @P2) | related_decisions()
