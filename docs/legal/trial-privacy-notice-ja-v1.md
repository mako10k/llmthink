# llmthink 試験利用 Privacy Notice

## 文書情報

- Status: draft for owner self-review
- Public version: `trial-privacy-ja-2026-08-v1`
- Effective date: 未定
- Controller: 勝又誠
- Contact: `mako10k@mk10.org`

## 1. 基本方針

運営者は、llmthink試験サービスにおいて取り扱う情報を、利用目的に必要な範囲へ限定し、tenant分離、
access control、保存境界、監査およびincident対応を通じて適切に管理します。

本サービスは、account registryへemail addressまたはdisplay nameを保存しない設計を採用します。ただし、
利用者が利用者データ内へ個人情報を入力した場合、当該情報は保存データとして取り扱われます。

## 2. 取得または生成する情報

### 認証・account情報

- WorkOS issuer
- WorkOSの外部subject ID
- organization ID（tokenに存在する場合）
- 仮名の内部subject、tenant、workspace ID
- account state、mapping revision、scope policy binding

WorkOSのpassword、Google credential、authorization code、refresh tokenはllmthinkへ保存しません。

### 同意・契約情報

- 同意した規約ID、versionおよび本文・要約のdigest
- 同意日時および同意action version
- 仮名accountとの対応
- 規約変更、再同意、利用停止、終了に関する状態履歴

### 利用者データ

- 利用者が作成、送信または保存するthought、audit、reflectionその他の内容
- revision、更新日時、idempotencyその他整合性維持に必要なmetadata

### 運用・security情報

- request ID、時刻、結果code、処理時間
- 仮名化または短縮digest化したsubject、tenant、workspace識別情報
- rate limit、障害、認証失敗、abuseおよびincident対応に必要な記録

access token、recovery credential平文、email、利用者データ本文を通常のapplication logへ記録しません。

## 3. 利用目的

取得または生成した情報を、次の目的で利用します。

1. 認証済みidentityと内部accountを安全に対応付けるため
2. 規約同意、再同意および利用資格を確認するため
3. 専用tenant/workspaceを提供し、他tenantから分離するため
4. thought、auditその他利用者が要求した機能を提供するため
5. revision、idempotency、backup、復旧およびarchiveを実現するため
6. rate limit、不正利用防止、security、障害調査およびincident対応のため
7. サービス改善、容量計画および品質評価のため。この場合も、必要性なく利用者データ本文を分析対象へ
   転用しません
8. 法令上の義務、権利行使または紛争対応のため

## 4. 外部serviceおよび委託

本サービスは、少なくとも次の外部serviceを利用します。

- WorkOS, Inc.（WorkOS AuthKit）: 認証、OAuth、identity lifecycle
- GMOインターネット株式会社（ConoHa VPS）: server、storageおよびnetwork

現時点では、外部の専用backup保管serviceは利用しません。導入する場合は、provider、取扱情報および
必要な国外移転情報を本noticeへ追記してから利用します。

運営者は、利用目的に必要な範囲で取扱いを委託し、契約、設定、access controlその他合理的な方法で
委託先を管理します。委託先、保存国、再委託先および国外移転に関する情報は、次のprovider開示も参照して
ください。

- WorkOS Privacy Policy: `https://workos.com/legal/privacy`
- WorkOS Subprocessors: `https://trust.workos.com/subprocessors`
- GMOインターネットグループ Privacy Policy: `https://group.gmo/csr/governance/privacy-policy/`

法令に基づく場合、生命・身体・財産の保護に必要な場合その他法令上認められる場合を除き、利用者データを
無関係な第三者へ販売または提供しません。

## 5. 保存期間

| 区分                          | 保存期間                                         |
| ----------------------------- | ------------------------------------------------ |
| active account mapping        | account利用中                                    |
| agreement receipt             | account終了後5年またはより長い法定期間           |
| account security audit        | 発生後1年                                        |
| idempotency record            | 原則24時間、設定上1時間から7日                   |
| 利用者データ                  | account利用中および終了通知から30日のarchive期間 |
| operational backup            | 作成後30日                                       |
| closed mapping/recovery audit | account終了後1年                                 |

incident、紛争、法令上の要請またはbackup世代の都合により、必要最小限の情報を通常期間より長く隔離保存
する場合があります。期間終了後は、安全な削除または実用上個人と結び付かない処理を行います。

## 6. 安全管理

運営者は、情報の性質とservice規模に応じ、次の措置を講じます。

- WorkOS identityと内部tenant IDの分離
- tenant/workspaceを越えるaccessのfail-closed検査
- 最小scope、server-side authorizationおよびcredential分離
- lifecycle control planeとthought data planeの論理分離
- protected file permission、schema検証、transaction、backupおよびrestore検査
- recovery credentialの一度限りの表示とKDF verifier保存
- token、email、recovery平文、利用者データ本文を避けたprivacy-safe logging
- 脆弱性、dependency、providerおよびaccess権限の見直し
- incident発生時の影響確認、封じ込め、通知および再発防止

安全管理の詳細は、それ自体がsecurity riskとなる範囲では公開しない場合があります。

## 7. 通信および保存内容の秘密

運営者は、通信内容および保存内容について、適用される通信の秘密、秘密保持その他の義務に従います。
運用担当者による内容へのaccessは、障害復旧、security incident、本人からの依頼、法令上の要請その他
具体的な必要性がある場合に限定し、可能な範囲で記録・監査します。

## 8. 利用者による確認、archive、訂正および終了

利用者は、指定された方法により、次を請求または実行できます。

- 利用者データのarchive
- account状態および適用規約versionの確認
- 誤ったaccount mappingの調査
- recoveryまたは外部identity移行の申出
- account終了および法令上認められる情報の開示、訂正、利用停止または削除の請求

運営者は、他人の情報開示やaccount乗っ取りを防ぐため、復旧識別子その他の方法による本人確認を求める
場合があります。請求は`mako10k@mk10.org`へ連絡してください。

## 9. Cookie等

onboarding browser surfaceでsession維持およびCSRF防止にcookie等を使用する場合、用途、属性、保存期間を
実装確定時に追記します。広告trackingまたはcross-site profilingは、別途明示し同意を得ない限り行いません。

## 10. 変更

本noticeの重要な変更は、新しいversionとして公開します。利用者の権利義務または利用者データの取扱いへ
重大な影響がある場合、利用規約に従って通知または再同意を求めます。

## 11. 問い合わせ

- 運営者: 勝又誠
- 連絡先・請求方法: `mako10k@mk10.org`
