# ADR-0013: 初期off-ConoHa backup storageにCloudflare R2 Standardを採用する

## Status

accepted

## Date

2026-08-21

## Context

- hosted llmthinkのprimary server、account、API、snapshot、supportはConoHaに依存している
- ConoHaが長期停止または利用不能になっても取得できるencrypted backupをP0要件とする
- 現在のhosted data rootはread-only metadata確認時点で約192 KB、regular file 27件であり、初期規模は
  小さい。ただし将来容量を保証する観測ではない
- 無償試験では、管理負荷と固定費を抑え、手動restoreを許容する
- backup providerはplaintext user dataまたはplaintext backup keyを受領しない。client-side authenticated
  encryptionはstorage providerとは別のP0責務である
- automatic failover、第二backup provider、recovery custodianは初期範囲外のP2改善とする

## Decision

初期off-ConoHa backup storageとしてCloudflare R2のStandard storage classを採用する。

- privateな専用bucketを使用し、public accessを有効にしない
- bucket作成時はAPAC location hintを使用する。ただし日本国内保存または特定regionを保証する表現は
  しない
- backup clientはS3-compatible APIを使用できる構成を優先し、provider固有APIへの不要な固定を避ける
- backup payloadはConoHaから送信する前にclient-sideで認証付き暗号化する
- runtime credentialは専用bucketへ限定し、account/bucket管理credentialをVPSへ保存しない
- object key、receipt、logへtenant、email、content、keyまたはsecretを含めない
- 初期retention targetは30日とするが、R2 Bucket Lockはbackup clientのprune、compaction、rewriteとの
  適合性を検証するまで有効化しない
- restoreは新しい隔離pathへ行い、tenant ownershipとartifact integrityを検証してから別途owner-gatedで
  activationする

この決定はstorage providerとstorage classを固定する。backup client、repository format、key custody、
credential投入、schedule、retention automation、restore procedureは後続の設計判断とする。

## Alternatives Considered

### Backblaze B2

- R2より低い超過容量単価と、governance/compliance modeを持つ強いObject Lockが利点
- 現行の公開regionにAPACがなく、初期の管理容易性とincident時のegress条件ではR2を優先した
- stronger immutabilityがP0または契約要件になった場合の第一再検討候補とする

### Wasabi

- S3-compatibleでbackup用途に適する
- 1 TB minimum commitmentと90-day minimum storage durationが、現在の小容量と30-day targetに合わない
  ため不採用

### Amazon S3 / S3 Glacier

- Japan region、IAM、Object Lock、storage classの選択肢が豊富
- 初期規模に対して料金・権限・retrieval・minimum durationの設計負荷が高いため延期する
- 日本region保証、既存AWS運用、complianceまたはscale要件が生じた場合に再検討する

### ConoHa内の追加disk、snapshotまたはobject storageのみ

- primary serverと管理・契約上のfailure domainを共有し、ConoHa-independent retrievalというP0目的を
  満たさないため、唯一のbackup先としては不採用

### operator管理のlocal/offline storageのみ

- provider障害から独立できるが、operator device喪失、物理破損、接続忘れ、手動運用負荷が初期primary
  backupとして大きい
- 第二copyまたは将来のP2改善としては再検討できる

## Consequences

- 現在規模ではR2 Standardのfree tier内に収まる可能性が高く、固定費を抑えられる
- restore egress chargeがないため、incident時のdownload costを単純化できる
- S3-compatible toolを比較でき、backup clientの選択肢を保持できる
- ConoHa accountと独立した取得経路を構成できる
- R2 APACはlocation hintであり、日本国内保存の保証ではない
- Cloudflare accountまたはR2 control planeは新しいsingle-provider dependencyになる
- R2 Bucket Lockは管理者がruleを削除でき、B2 compliance-mode相当の絶対的immutabilityではない
- provider-side encryptionだけではP0 confidentialityを満たさず、client-side key custodyが必須になる
- free tier、pricing、API、location behaviorは将来変更され得るため、定期確認が必要になる

## Auditability Notes

- upstream requirements: `docs/security/backup-threat-model.md`
- evaluated profile and source links: `docs/security/backup-storage-hypothesis.md`
- related accepted boundary: ADR-0012 SQLite lifecycle control plane
- owner accepted Cloudflare R2 Standard on 2026-08-21
- account、bucket、billing、credential、VPS software、data upload、Bucket Lock、restore、Stage、public
  enrollment、Production activationは本ADRの承認範囲外
- backup clientとkey custodyを受け入れる後続ADRまたはdesign gateなしにexternal setupへ進まない

Reconsider this decision when:

- encrypted backupが10 GBを継続的に超える
- stronger immutable retentionがP0または契約要件になる
- 日本国内または特定jurisdictionの保証が必要になる
- Cloudflareがllmthinkの他のcritical control surfaceと相関したfailure domainになる
- restore rehearsalがR2 account、APIまたはselected toolの運用上の不適合を示す
- 有償利用またはsensitivity増加により第二providerを正当化できる
