# ADR-0014: 初期運用版としてrestic 0.19.1を固定する

## Status

proposed

## Date

2026-08-21

## Context

- acceptedなbackup designはrestic releaseの明示固定、公式binaryの検証、scheduled jobでの
  `self-update`禁止を要求している
- local L1では公式Linux amd64 release assetのrestic 0.19.1を使い、synthetic repositoryに対する
  format 2 init、backup、`check --read-data`、restore、forget、pruneが成功した
- restore validation実装はrestic versionの完全一致と、manifest、component digest、SQLite、thought
  ownership、tenant reconciliationのfail-closed検証を要求する
- package managerの追随版、自動更新、未固定のdownload URLは、backup作成環境と災害時restore環境の
  再現性を弱める
- binaryの取得経路をHTTPSまたは単一のhashだけに依存せず、release署名と完全な鍵fingerprintまで
  運用契約に含める必要がある

## Proposed Decision

初期運用版を **restic 0.19.1 Linux amd64** に固定する。公式GitHub release asset
`restic_0.19.1_linux_amd64.bz2`だけを使用し、VPSへ導入する前に次の検証をすべて通す。

1. exact release tag `v0.19.1`とasset名を固定し、redirect後を含む取得元をreceiptへ記録する。
2. 同じreleaseから`SHA256SUMS`と`SHA256SUMS.asc`を取得する。
3. `SHA256SUMS.asc`を、restic公式installation documentationに掲載された次の完全なfingerprintと
   一致するOpenPGP keyで検証する。short key IDだけでは受け入れない。

   `CF8F 18F2 8445 7597 3F79 D4E1 91A6 868B D3F7 A907`

4. 署名検証済み`SHA256SUMS`によりcompressed assetを検証する。0.19.1 Linux amd64 assetの
   local L1観測値は次であり、導入時にも完全一致を要求する。

   `f415415624dcc452f2a02b8c33641791a8c6d6d3b65bbb3543fcf9a25151585c`

5. defense in depthとしてGitHub release APIが返すasset digestとも照合する。API digestだけを署名検証の
   代用にはしない。
6. absentなstaging pathへ展開し、展開後binaryのSHA-256を新たに記録する。`restic version`が
   `restic 0.19.1`、`linux/amd64`を示さなければ導入しない。
7. root所有、非書込可能なversioned path `/opt/llmthink/bin/restic-0.19.1`へ配置する。backup設定は
   mutableなPATH lookupや`latest` URLではなく、このabsolute pathとexact versionを要求する。

署名鍵の取得自体はbootstrap trustを伴う。keyserverから得た鍵をshort IDで信用せず、公式documentation
のfingerprintとの完全一致を人が確認する。receiptはsource URL、tag、asset名、署名fingerprint、compressed
および展開後digest、version output、検証時刻、検証者を含み、secret、user path、tenant、contentは含めない。

## Update and rollback policy

- scheduled job、timer、deployment hookから`restic self-update`を実行しない
- 新版が存在するだけでは更新しない。security advisory、backend互換性、restore不具合、OS/architecture
  変更、または明確な運用上の利益をreview triggerとする
- 更新候補は別versioned pathへ導入し、署名検証、synthetic L1、既存repositoryのread-only check、exact
  snapshot restore、application-level restore validationを通してからownerが別途acceptする
- R2 behaviorまたはrepository mutationへ影響し得る更新はdisposable R2 testも再実行する
- repository format migrationはclient更新と分離し、別の承認、直前backup、旧clientでのrestore可能性確認、
  rollback制約の記録なしに実行しない。初期repository formatは2のままとする
- 新版accept後も旧binaryを、少なくとも新版による一回のaccepted backup、full-data check、isolated restore
  完了まで保持する。不具合時は設定を旧absolute pathへ戻すが、新版がrepositoryを変更した場合は
  rollback可能と仮定せずrestore evidenceに従う
- critical security advisoryは即時reviewし、利用停止、一時的なbackup suspension、patch版更新のどれが
  機密性と復旧可能性を最も損なわないかを判断する

## Alternatives Considered

### Distribution package

- OS標準の更新経路を使える
- distributionごとの版、patch、更新時点に依存し、exact upstream releaseと災害時restore環境を揃えにくい
  ため初期運用経路にはしない

### `restic self-update`

- upstream署名を検証する仕組みを持つ
- scheduled operation中に実行版を変更し、owner acceptanceとlocal/R2/restore gateを迂回し得るため禁止する

### Source build

- toolchainとsourceを固定すれば供給経路を追加検証できる
- Go toolchain、dependency、reproducibilityの管理範囲が増える。初期試験では公式署名済みreleaseを優先し、
  reproducible-build確認はP2とする

### Container image

- binaryとruntimeを一体で固定できる
- container runtime、image registry、base image、mount、secret deliveryが新しい運用面になるため採用しない

## Consequences

- L1で検証済みのversionと本番候補が一致し、adapterのexact-version contractを維持できる
- 署名、checksum、API digest、展開後digestにより、偶発破損と単一metadata経路の置換に対する検出層を持つ
- upstream GitHub account、release workflow、署名鍵、公式documentationが同時に侵害されるriskは残る
- 独立したreproducible buildは行わないため、公式binaryのbuild provenanceを完全には再検証しない
- versioned pathと旧版保持に追加diskと運用手順が必要になる
- security updateは自動適用されず、advisory reviewを忘れるriskが残る

## Acceptance boundary

本ADRのacceptは、0.19.1 verification receipt作成、VPS導入runbook、disposable R2 test planの準備だけを
許可する。VPS接続・導入、R2 resource/credential作成、secret配置、live data backup、timer有効化、restore
activation、Production変更はそれぞれ別途承認を要する。

## Auditability Notes

- upstream accepted design: `docs/security/restic-r2-backup-design.md`
- implementation plan: `docs/security/restic-r2-implementation-plan.md`
- local evidence: `docs/security/restic-l1-evidence.md`
- restore contract: `implementation/backup-slice-d-restore-validation`
- official release: `https://github.com/restic/restic/releases/tag/v0.19.1`
- official installation and signature verification documentation:
  `https://restic.readthedocs.io/en/stable/020_installation.html`
- this draft does not itself accept 0.19.1 or authorize any external change

Reconsider this decision when:

- an applicable restic security advisory is published
- 0.19.1 cannot read, check, or restore the selected repository profile
- Cloudflare R2 changes the required S3 behavior
- the VPS architecture or supported OS changes
- upstream signing key or release verification procedure changes
- independent binary provenance becomes P0 or contractually required
