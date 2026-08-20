# ADR-0011: 試験利用者を規約同意後に専用 tenant へ自動登録する

## Status

accepted

## Date

2026-08-20

## Context

- ADR-0010 は WorkOS の外部 identity と llmthink の subject、tenant、workspace、scope
  を server-side account registry で分離し、未登録 identity を fail closed で拒否する
- 現行 registry は operator が個別に追加する静的 JSON であり、不特定の試験利用希望者を
  受け入れる運用には適さない
- 当面の hosted llmthink は試験サービスであり、機能、利用条件、保存容量、提供形態、料金が
  将来変更される可能性がある。継続提供も保証できない
- ただし、認証に成功しただけで利用条件への同意、内部アカウント作成、tenant 割当、または
  llmthink scope の付与が成立したとは扱えない
- WorkOS AuthKit Hosted UI は規約およびプライバシーポリシーへのリンクを表示できるが、
  llmthink 固有の規約版、明示同意、再同意、アーカイブ猶予を管理する正本にはしない
- メールアドレス、display name、upstream provider credential を llmthink のアカウント管理に
  保存せず、仮名 identity と最小限の同意証跡だけで運用したい
- tenant は hard isolation boundary であり、任意ユーザー受入れを共有 tenant や wildcard
  mapping で実現してはならない

## Decision

hosted llmthink は、認証可能な任意の利用希望者を試験利用の候補とする。ただし、現行の
利用条件に明示同意した identity だけを、一人一つの専用 tenant と初期 workspace へ
自動プロビジョニングする。

### Authority and admission boundary

- WorkOS は authentication と不変な外部 subject の提供を担う
- llmthink は利用条件への同意、内部 account、tenant/workspace、scope、停止状態の正本を担う
- 有効な WorkOS access token は利用資格ではない。signature、issuer、audience、時刻 claim、
  subject を検証した後も、現行規約への同意と active account mapping を検証できなければ
  resource access を fail closed で拒否する
- email、display name、WorkOS metadata、client 引数、tool 引数だけを根拠に同意済みまたは
  account 登録済みへ昇格させない
- 未知 identity を許可する wildcard registry entry は導入しない

### Explicit agreement

- 初回利用前に、llmthink が管理する HTTPS onboarding surface で利用条件の全文または固定版への
  link と、重要事項の要約を表示する
- 同意操作は「同意して試験利用を開始する」のような明示 action とし、単なるログイン、規約 link
  の表示、MCP tool 呼出し、継続利用だけを同意とみなさない
- 重要事項には少なくとも次を含める
  - 本サービスと当該 account は試験提供であること
  - 機能、利用条件、保存容量、提供形態が将来変更され得ること
  - 将来の新規期間またはプランが有料になり得ること。ただし再同意なしに遡及課金しないこと
  - サービスの永続的、継続的、無停止の提供を保証しないこと
  - 利用者が保存データへ個人情報その他の情報を入力する場合、その内容と適法性は利用者が
    管理すること
  - 運営者は認可境界、秘匿性、保存データの安全管理に責任を持つが、責任範囲は適用法令に
    反しない範囲で利用条件に定めること
- 同意証跡の正本として、外部 identity key、内部 subject ID、terms version、規約本文の
  cryptographic digest、同意日時、同意 action version を保存する
- IP address、User-Agent、email、display name は、別の具体的な安全管理目的と保存期限を
  定めない限り同意証跡へ保存しない
- 規約本文は version と digest が対応する immutable artifact として保存し、後日の文言変更で
  過去の同意対象を上書きしない

### Provisioning and isolation

- 現行規約への同意記録の作成と、内部 account mapping、専用 tenant、初期 workspace の作成は、
  同一の idempotent provisioning operation として扱う
- 再送、callback 重複、並行要求があっても、同じ外部 identity key に複数 account または複数
  tenant を作らない
- 内部 subject ID、tenant ID、workspace ID は server が生成する仮名 random identifier とし、
  email、WorkOS `sub`、`org_id` から導出しない
- 一つの自動登録 account は一つの専用 tenant に所属する。共有、招待、tenant 横断、account
  merge は本 ADR の非目標とする
- 初期 scope は別途定めた trial policy の固定集合から server が付与し、OAuth scope、client 要求、
  tool 引数による自己昇格を許さない
- recovery 用に高 entropy の非個人識別子を利用者へ一度提示できるようにする。recovery code
  自体は平文保存せず、検証用表現と発行・失効状態を保存する

### Terms lifecycle and service lifecycle

- 誤字修正など権利義務を変えない変更は同じ material version の訂正履歴として扱える
- 料金、保存期間、データ取扱い、責任範囲、利用可能機能、終了条件などの重要変更は新しい
  terms version とし、影響する利用者の再同意を必要とする
- 再同意が必要な account は、既存データの export、account closure、規約表示に必要な最小操作を
  除き、新規の read/write/finalize/audit 利用を停止する
- 有料化は新しい明示同意または別の購入契約より後の利用にだけ適用し、沈黙、ログイン、既存の
  試験利用同意を課金承諾へ読み替えない
- サービス終了または互換性を失う重大変更では、法令、security incident、provider 停止などで
  不可能な場合を除き、合理的な事前通知とデータ archive 取得期間を設ける
- 継続提供を保証しないことは、保存データの秘匿性、tenant isolation、事故対応、法令上免除
  できない義務を放棄する根拠にしない

### Transition from the static registry

- 本 ADR が accepted になっただけでは、任意ユーザーの受入れを開始しない
- onboarding、versioned terms artifact、agreement receipt、idempotent provisioning、re-consent、
  export-only state、recovery、監査、abuse response の実装と acceptance test が揃うまでは、
  ADR-0010 の静的 registry と operator 登録を維持する
- 移行時は既存 account mapping を保持し、既存利用者にも適用対象の terms version への明示同意を
  要求する。自動登録開始の外部公開と Production activation は別途 owner approval を必要とする

## Alternatives Considered

- WorkOS 認証に成功した全 identity を即時利用可能にする
  - authentication を契約同意と authorization に読み替え、規約版の証跡と再同意を持てないため
    不採用
- AuthKit Hosted UI の規約 link だけで同意済みとする
  - 表示は有用だが、明示 action、規約版、再同意、llmthink account との対応を正本として管理
    できないため、補助表示に限定する
- operator が全利用者を静的 registry へ手動登録し続ける
  - 初期 Stage と例外対応には使えるが、任意ユーザー受入れの速度、誤登録防止、一貫した同意証跡
    に限界があるため恒久方式として不採用
- 全利用者を一つの trial tenant または workspace に登録する
  - tenant hard boundary を失い、誤認可や情報漏洩の影響範囲を拡大するため不採用
- 同意状態を WorkOS user metadata だけに保存する
  - provider migration、規約 artifact、transaction、監査、recovery の authority が外部 provider に
    結合するため不採用。必要なら cache または補助 claim としてのみ利用する
- email を account key として同意・復旧に使う
  - 個人情報保持、変更、再利用、provider 間の誤 link を招くため不採用

## Consequences

- 招待制に限定せず試験利用者を受け入れつつ、認証、同意、認可、tenant isolation を分離できる
- メールアドレスを llmthink の account registry に保存せず運用できる
- 利用条件の変更、有料化、終了を、規約版と再同意によって将来実施できる
- onboarding 用の小さな web surface と、同意・account lifecycle の永続 store が必要になる
- MCP client が onboarding URL や再同意理由を十分表示しない場合に備え、公開ドキュメントと
  browser で直接開ける導線が必要になる
- account 作成と tenant 作成の原子性、idempotency、途中失敗 recovery が新たな実装責務になる
- 規約文面、通知期間、archive 猶予、責任制限の有効性は技術 ADR だけでは確定せず、公開前に
  適用法令と実際の事業形態に合わせた法務確認が必要になる
- abuse、容量枯渇、bot 登録、利用停止、削除要求への運用設計が必要になる

## Auditability Notes

- ADR-0010 を置換せず、同 ADR の account registry と authorization mapping に、試験利用者の
  admission、agreement、provisioning、terms lifecycle を追加する
- ADR-0008 の tenant/workspace repository key と revision 契約を変更せず、自動生成された専用
  tenant/workspace にも同じ isolation contract を適用する
- authoritative evidence は、versioned terms artifact、agreement receipt、provisioning transaction、
  account state transition、archive/export receipt、Stage acceptance record とする
- agreement receipt なしの resource access、共有 trial tenant、email による自動 account link、
  client requested scope の自己付与、再同意なしの課金を security または contract defect とする
- 次の条件で再判断する
  - WorkOS が versioned explicit consent と証跡 export を必要十分な形で提供する
  - organization membership、共有 workspace、tenant 招待を導入する
  - 有料プラン、決済、返金、消費者向け継続課金を導入する
  - account deletion、法定保存、通信の秘密その他の適用義務が保存モデルを変更する
  - MCP authorization flow 内で onboarding を標準的に表現できる仕様が成立する
- 本 ADR の admission、agreement、provisioning、terms lifecycle 境界は 2026-08-20 に
  owner が明示承認した。この承認は実装開始、利用規約の法的文面確定、自動登録の外部公開、
  有料化、または Production activation の承認を含まない
