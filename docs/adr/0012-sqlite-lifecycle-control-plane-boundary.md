# ADR-0012: account registry と tenant catalog を論理分離した SQLite control plane を採用する

## Status

accepted

## Date

2026-08-20

## Context

- ADR-0010 は外部 identity を内部 subject、tenant、workspace、scope へ解決する account registry
  を要求する
- ADR-0011 は明示同意後の account、専用 tenant、初期 workspace の冪等な自動作成を要求する
- 現行の静的 JSON registry は起動時read-only mappingには適するが、同意証跡、状態遷移、並行する
  初回登録、unique constraint、durable transactionを安全に扱えない
- account registry と tenant境界を同一module・同一recordとして密結合すると、外部identity lifecycle
  がtenant data authorityへ侵入する
- 一方、初期段階から別DBまたは別serviceへ物理分割すると、identity mappingとtenant割当の間に
  distributed transactionまたは補償処理が必要になり、重複tenantやorphan mappingの危険が増える
- thought contentとrevisionはADR-0008の`ThoughtRepository`境界にあり、account lifecycle DBへ
  取り込まない

## Decision

初期hosted実装では、account lifecycleのcontrol plane authorityとしてSQLiteを採用する。
競合防止に必要な最小範囲を一つのSQLite transactionへ置く一方、account registry、agreement、
tenant catalog、workspace catalog、scope policy、realization outboxを別table・別repository port・別service
責務として論理分離する。

### Physical and logical boundary

- 一つの保護されたSQLite database fileを初期control planeのtransaction boundaryとする
- schema内では少なくとも次を分離する
  - external identity mapping
  - account lifecycle
  - terms artifacts and agreement receipts
  - tenant ownership catalog
  - workspace catalog
  - scope-policy binding
  - recovery verification record
  - realization outbox
- account registryは外部identityから内部`subjectId`とaccount stateを解決する。tenant content、
  filesystem path、thought revisionを所有しない
- tenant catalogはopaqueな`tenantId`の所有accountと状態を管理する。WorkOS issuer、`sub`、email、
  tokenをtenant data planeへ公開しない
- thought repositoryは検証済みの内部`RequestContext`だけを受け、SQLite lifecycle tableを直接参照
  したり外部identityを再解決したりしない
- workspace contentとthought revisionは既存の`ThoughtRepository` data rootに留め、control plane DBへ
  保存しない

### Cross-boundary consistency

- 外部identity mapping、account、agreement receipt、tenant ownership、initial workspace catalog、scope
  policy binding、outbox eventの初回作成は一つのserializable write transactionでcommitする
- unique constraintで、外部identity keyごとにmapping一つ、accountごとにtenant一つ、tenant/workspace ID
  全体で一意、provisioning operationごとに結果一つを強制する
- application serviceはregistry recordを先に公開してからtenantを作る、またはtenantを先に作ってから
  mappingを公開する二段階処理を行わない
- filesystem上のtenant/workspace realizationはtransaction後のoutbox consumerが実行する。catalog
  ownershipが正本であり、directoryの存在をownership証拠にしない
- realization完了前は通常resource accessをfail closedとし、同じoutbox eventを冪等に再試行する
- DB commit後・filesystem realization前のcrashはpending outboxから回復する。filesystem作成後・完了記録前
  のcrashは同一pathとowner bindingを検証して完了でき、別ownerなら停止する

### Dependency direction

```text
WorkOS token verifier
        ↓ external identity
AccountAdmissionService
        ↓ registry/account/agreement ports
SQLite lifecycle control plane
        ↓ verified internal RequestContext
Application Service
        ↓ tenantId/workspaceId only
ThoughtRepository data plane
```

- data planeからWorkOS、email、terms UI、recoveryへ依存しない
- registry repositoryからThoughtRepositoryへ依存しない
- provisioning coordinatorだけが一つのunit of workとして複数control-plane portを調停する
- authorization read pathは一つのconsistent SQLite snapshotからmapping、account state、tenant ownership、
  scope policyを解決し、組み合わせを検証できない場合はfail closedとする

### Future physical separation

- repository portとoutbox event schemaは、将来registry service、tenant catalog、data planeを物理分離
  できる形に保つ
- ただし別DB・別serviceへの分離は、idempotency key、event ordering、delivery semantics、reconciliation、
  orphan handling、backup consistencyを別ADRで受け入れるまで実施しない
- SQLite fileのtable分離をsecurity boundaryとは呼ばない。security boundaryはserver-side authorization、
  OS file permission、process権限、backup管理、tenant-scoped repository keyの組合せで成立する

### Operation and recovery

- database file、WAL、shared-memory file、backupを同じ機密区分で管理する
- service以外の非特権userからread/writeできないowner/group permissionを設定する
- foreign keys、WAL mode、bounded busy timeout、transaction retry上限、integrity checkを明示設定する。
  driver、Node.js runtime、同時writer、busy時の0回blind retry契約はADR-0017で具体化する
- schema migrationはversioned、forward-only、backup後、単一writerで実行し、未知schemaはfail closedとする
- backupはSQLite online backup APIまたは整合したsnapshotを使用し、DB fileだけの不整合copyを行わない
- restore acceptanceではregistry、agreement、tenant catalog、outbox、data rootの対応を検査し、欠落や
  多重ownerを自動修復しない

## Alternatives Considered

- 静的JSON registryを排他lock付きで更新する
  - transaction、複数unique constraint、append-only receipt、schema migration、crash recoveryが複雑に
    なるため不採用
- registry DBとtenant catalog DBを最初から物理分割する
  - 責務分離は明瞭になるが、初回provisioningにdistributed consistency問題を持ち込むため不採用
- registryとtenant dataを一つのSQLite schema/modelへ統合する
  - transactionは単純だが、external identityとthought data planeが密結合し、将来分離と最小開示を
    損なうため不採用
- tenant directoryの存在をregistryとして使う
  - filesystem名がauthorityになり、partial creation、path collision、ownership検証不能を招くため不採用
- 最初からnetwork databaseを採用する
  - scale-outには有利だが、現段階の単一serviceに運用負担と追加failure modeを持ち込むため不採用

## Consequences

- 初回登録に必要なatomicityとunique constraintを一つのlocal transactionで確保できる
- Registryとtenant data planeのdomain責務、公開情報、dependency directionを分離できる
- SQLite自体は単一の障害・容量・writer contention点になるため、backup、monitoring、busy handlingが必要
  になる
- control plane DBとthought data rootの間は完全なatomic transactionではないため、outboxと
  reconciliationが必要になる
- 将来の物理分離は可能だが、自動的ではなく別のconsistency ADRとmigrationが必要になる
- 現行静的registryは移行・rollback用read-only sourceとして期限付きで残し、二つのauthorityへ同時write
  してはならない

## Auditability Notes

- ADR-0010のidentity/authorization分離、ADR-0011のagreement/provisioning lifecycle、ADR-0008の
  tenant-scoped ThoughtRepositoryを変更せず、その間のcontrol plane永続化を具体化する
- unique constraint、transaction isolation、outbox replay、crash injection、restore fsck、cross-tenant denial
  のtestをacceptance evidenceとする
- external identityがThoughtRepositoryへ渡る、directory存在がownershipを決める、二重authorityへwrite
  する、outbox未完了でresource accessを許す、またはrestoreが多重ownerを自動選択した場合はdefectとする
- SQLite採用とlogical separationは2026-08-20にownerが明示承認した。この承認はschema実装、migration、
  Stage deployment、Production activation、またはpublic enrollmentを含まない
