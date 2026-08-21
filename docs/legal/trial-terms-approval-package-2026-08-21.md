# llmthink 試験利用規約 owner self-approval package

## Status

- Prepared: 2026-08-21
- Decision state: owner review pending
- External legal review: not performed
- Scope: 無償の試験利用のみ
- Operator-address disclosure: owner accepted individual notice without public residential-address
  publication on 2026-08-21
- Effective date: owner selected 2026-08-21
- This package does not authorize publication, public enrollment, billing, OAuth Production
  activation, or deployment.

## Exact review set

Owner self-approval must cover the exact UTF-8 bytes of these three files:

1. `docs/legal/trial-terms-ja-v1.md`
2. `docs/legal/trial-important-summary-ja-v1.md`
3. `docs/legal/trial-privacy-notice-ja-v2.md`

| Artifact                           | SHA-256                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| `trial-terms-ja-v1.md`             | `f7dbfd78a03886cd23590b5c6d158a18550c658c4e3632284cd1473c1d073af5` |
| `trial-important-summary-ja-v1.md` | `5520d713ad30b863421b4e1f55b427504062e337dff214dcafb6268ccc11e28f` |
| `trial-privacy-notice-ja-v2.md`    | `c94877b83af0ec40b74408161c67afc075cb36f21640128d0997bd15d0a3ac22` |

The final approval receipt will record each SHA-256, the Git revision, approval date, effective
date, and absence of external legal review. Any later byte change requires a new digest and review;
a material change additionally requires a new public version and user re-consent.

## What is now supported by operational evidence

- The public status and notification page is deployed at `https://llmthink.mk10.org/status`.
- The lifecycle control plane and one-user-one-tenant constraints are implemented locally.
- Cloudflare R2 is disclosed as an external processor for client-side encrypted backup objects.
- A first encrypted legacy recovery generation was created, checked, restored off ConoHa, and
  compared without activation.
- The temporary recovery credential and all recovery-only local secret entries were revoked or
  deleted after the rehearsal.

The backup remains manual. The text therefore does not promise continuous freshness, automated
retention, immediate failover, or a recovery-time guarantee.

## Material terms the owner is being asked to accept

- The service is experimental, may change or end, and is not guaranteed to be uninterrupted.
- Users must keep their own archive and must not rely on llmthink as their sole copy.
- Login is not agreement; exact-version explicit consent is required.
- Each account receives a dedicated tenant. Cross-tenant access is denied, including when
  authorization cannot be verified.
- Users decide whether they may lawfully input personal, confidential, or third-party data. This
  does not transfer llmthink's confidentiality, access-control, safety-management, or incident
  duties to the user.
- Material changes require notice and re-consent. A future paid plan requires a separate express
  agreement and is not retroactive.
- Except in urgent or impossible circumstances, termination or incompatible material change has
  at least 14 days' notice and at least a 30-day archive period from notice.
- For ordinary negligence, liability is limited to direct and ordinary damage and capped at the
  greater of fees paid in the preceding 12 months or JPY 10,000. The cap does not apply to intent,
  gross negligence, death or bodily injury, or other non-excludable liability.
- WorkOS, ConoHa, and Cloudflare R2 are external services. R2 objects are encrypted before upload;
  the APAC location hint does not guarantee storage in Japan or a particular country.

## Public-law review notes

The following official materials were rechecked on 2026-08-21:

- Personal Information Protection Commission general guidelines on use purpose, retained personal
  data, disclosure procedures, and risk-proportionate safety controls:
  `https://www.ppc.go.jp/personalinfo/legal/guidelines_tsusoku/`
- Personal Information Protection Commission foreign-third-party guidelines on informed consent,
  information provision, and safeguards:
  `https://www.ppc.go.jp/personalinfo/legal/guidelines_offshore/`
- Consumer Affairs Agency Consumer Contract Act Article 8 commentary on invalid exclusions or
  limitations for intentional or grossly negligent conduct:
  `https://www.caa.go.jp/policies/policy/consumer_system/consumer_contract_act/annotations/`

The draft keeps mandatory-law carve-outs and does not let the operator unilaterally decide whether
fault or gross negligence exists. The Privacy Notice now states how the operator address can be
obtained and gives a basic electronic request procedure. These are internal review conclusions,
not legal advice or an external legal opinion.

## Decisions still required from the owner

1. Read and accept the exact three files, including the JPY 10,000 ordinary-negligence floor,
   14-day notice, 30-day archive period, five-year agreement-receipt retention, one-year security
   audit retention, and manual-backup limitation.
2. Explicitly accept self-approval without external legal review and its residual enforceability
   and compliance risk.

## Accepted owner decision

The operator address will not be published as a residential address in the public notice. The
Privacy Notice will state that it is provided individually and without delay upon request. The
owner accepted this disclosure method on 2026-08-21. This decision does not waive a disclosure
obligation that applies to a particular request or transaction.

The owner selected 2026-08-21 as the effective date. This does not itself publish the artifacts,
activate onboarding, or authorize enrollment.

## Recommended approval wording

After the effective date has been inserted and final digests have been presented, the owner may
approve with:

> 提示された3文書の全文、version、発効日、SHA-256および残余リスクを確認しました。外部法務確認を
> 行わず、勝又誠の責任で無償試験利用向け文面を自己承認します。これは文書のSealとonboarding実装の
> 継続を承認しますが、公開、一般登録、課金、Production切替は別途承認とします。
