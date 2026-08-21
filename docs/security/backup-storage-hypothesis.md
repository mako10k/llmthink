# llmthink backup storage hypothesis

- Status: proposed for owner review
- Date: 2026-08-21
- Scope: off-ConoHa encrypted storage for the unpaid hosted trial
- Threat-model input: `docs/security/backup-threat-model.md`

## 1. Current scale and assumption

A read-only metadata check on 2026-08-21 observed approximately 192 KB and 27 regular files
under the current hosted data root, with no symlinks. This is a present-size observation, not a
capacity forecast and not proof that the future lifecycle SQLite file is included.

The first infrastructure hypothesis assumes:

- backup payloads are encrypted and authenticated client-side before upload;
- the storage provider receives ciphertext, not plaintext backup keys;
- one private bucket is dedicated to llmthink;
- daily generation and 30-day target retention remain P1 targets;
- restore is manual and may take hours or days;
- automatic failover, a second backup provider, and a recovery custodian remain P2;
- no provider account, bucket, credential, or data transfer is created by this document.

## 2. Candidate comparison

Prices and features below were checked against provider documentation on 2026-08-21 and may
change.

| Candidate              | Current small-scale cost                                                                                                                                                              | Management and integration                                                                         | Deletion resistance                                                                                                | Location and retrieval                                                                                               | Fit                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Cloudflare R2 Standard | First 10 GB-month, 1 million Class A operations, and 10 million Class B operations per month are free; then USD 0.015/GB-month. Internet egress is free.                              | Dashboard plus S3-compatible API; bucket-scoped object read/write tokens are available.            | Bucket Lock prevents overwrite/deletion for a period, but an account-level administrator can remove the lock rule. | APAC location hint is available but is best effort, not a Japan residency guarantee. Retrieval has no egress charge. | Best operational fit for the current tiny dataset and manual restore.                                                     |
| Backblaze B2           | First 10 GB is free; current storage price is USD 0.00695/GB-month above that. Free egress is limited to three times average stored data, then USD 0.01/GB.                           | Backup-oriented console, native and S3-compatible APIs, bucket/prefix-restricted application keys. | Object Lock supports governance and stronger compliance mode; compliance retention cannot be shortened by a user.  | Account is fixed to US East, US West, EU Central, or Canada East; no APAC region is currently documented.            | Stronger immutability and lower storage price, but less convenient geography and a more conditional recovery-cost policy. |
| Wasabi                 | One-TB monthly minimum and 90-day minimum storage duration apply to pay-as-you-go.                                                                                                    | S3-compatible and backup-oriented.                                                                 | Immutability features exist, but are unnecessary to compare further at current scale.                              | Restore egress policy has conditions tied to active storage.                                                         | Reject for the initial trial because minimum billing and retention do not match the tiny 30-day workload.                 |
| Amazon S3/Glacier      | No general minimum charge, but storage class, request, retrieval, early-deletion, and transfer pricing require more decisions. Glacier classes have 90- or 180-day minimum durations. | Most mature control surface, but the most operational and billing complexity for this scale.       | Strong Object Lock and IAM options.                                                                                | Japan regions are available, but archive retrieval and pricing add failure modes.                                    | Defer until compliance, residency, scale, or existing AWS operations justify the complexity.                              |

## 3. Provisional selection

Use **Cloudflare R2 Standard** as the first infrastructure hypothesis.

Why:

1. It is outside ConoHa and remains accessible without the ConoHa server or account.
2. The current dataset is far below the 10 GB free tier.
3. Standard storage has no minimum retention period and matches a rolling 30-day trial policy.
4. Restore egress is free, so an incident does not introduce an unpredictable download charge.
5. S3 compatibility keeps the backup client replaceable.
6. Bucket-scoped credentials and Bucket Lock provide useful P1 controls with a small management
   surface.
7. APAC placement should reduce ordinary transfer latency, although it is not a residency
   guarantee.

This selection does not rely on R2 server-side encryption for P0 confidentiality. Client-side
authenticated encryption remains mandatory because R2 manages and uses its own at-rest keys.

## 4. Proposed R2 profile

- Storage class: Standard, not Infrequent Access.
- Bucket visibility: private; no `r2.dev` public access and no custom public domain.
- Location: APAC hint, recorded as best effort rather than a Japan-location promise.
- Object naming: opaque repository/generation identifiers with no tenant, email, or content in
  keys.
- Runtime credential: scoped only to the dedicated bucket and only to operations required by
  the selected backup client.
- Administrative credential: not stored on the VPS.
- Payload: client-side authenticated encrypted repository.
- Retention: initially implement client-side 30-day policy; evaluate a 7- to 30-day Bucket Lock
  only after verifying how the backup client's prune/compaction behavior interacts with locked
  objects.
- Restore: retrieve to a new isolated path on a replacement or another authorized host; never
  restore in place first.

Do not enable Bucket Lock blindly. Repository-oriented backup tools may rewrite indexes or prune
objects, and an incompatible lock duration can make maintenance fail or retain data beyond the
published period.

## 5. Requirement mapping

| Threat-model requirement                      | R2 contribution                                             | Still owned by llmthink/operator                                 |
| --------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| ConoHa-independent retrieval (P0)             | Independent provider, API, and account                      | Preserve R2 account access and client-side key outside ConoHa    |
| Provider cannot read plaintext (P0)           | TLS and provider at-rest encryption help in transit/storage | Client-side authenticated encryption and separate key custody    |
| Consistent SQLite/WAL snapshot (P0)           | Stores supplied bytes                                       | Produce SQLite-supported snapshot before upload                  |
| Control/data recovery-point relationship (P0) | Stores multiple objects and manifest                        | Freeze and verify a generation manifest                          |
| Corruption/substitution detection (P0)        | S3 checksums and strong consistency assist                  | Authenticated repository plus independent manifest verification  |
| Tenant-safe isolated restore (P0)             | Downloads exact selected objects                            | Restore tooling, path validation, reconciliation, and owner gate |
| Deletion resistance (P1)                      | Bucket Lock is available                                    | Choose compatible duration; keep bucket-admin token off VPS      |
| Freshness monitoring (P1)                     | Metrics and object listing are available                    | Generate secret-free receipts and alert on stale generation      |
| Loss of operator device (P1)                  | Provider account recovery may help storage access           | Maintain separate recovery copy of client-side encryption key    |
| Simultaneous provider failure (P2)            | Not solved                                                  | Later add B2 or controlled offline encrypted generation          |

## 6. Limitations and reconsideration triggers

- R2 APAC is a placement hint, not guaranteed Japanese residency.
- An attacker controlling the Cloudflare account and bucket administration may remove a Bucket
  Lock rule; it is not equivalent to B2 compliance-mode Object Lock.
- One R2 account is still one provider/control-plane dependency.
- A Cloudflare account issue could affect multiple llmthink functions if they later share the
  same account. Account separation should be considered during setup.
- The free tier must not be treated as a permanence or continuity guarantee.

Re-evaluate B2 or AWS when any of the following occurs:

- stored encrypted backup exceeds 10 GB consistently;
- stronger immutable retention becomes P0 or contractually required;
- guaranteed jurisdiction or Japanese-region placement is required;
- trial revenue supports a second provider;
- recovery exercises show R2 account or tooling dependence is operationally fragile;
- Cloudflare becomes a correlated critical dependency for other llmthink control surfaces.

## 7. Owner decision and next gate

Owner acceptance of this hypothesis would authorize preparation of a detailed R2 setup and
backup-client comparison. It would not authorize:

- Cloudflare account or bucket creation;
- billing activation;
- credential generation or storage;
- installation of a backup client on the VPS;
- upload of live data;
- retention-lock activation;
- restore, Stage, public enrollment, or Production lifecycle activation.

After accepting R2 as the hypothetical storage, compare the client-side backup mechanism and
key-custody model separately before any external write.

## 8. Official sources checked

- Cloudflare R2 pricing: `https://developers.cloudflare.com/r2/pricing/`
- Cloudflare R2 bucket locks: `https://developers.cloudflare.com/r2/buckets/bucket-locks/`
- Cloudflare R2 S3 API: `https://developers.cloudflare.com/r2/get-started/s3/`
- Cloudflare R2 tokens: `https://developers.cloudflare.com/r2/api/tokens/`
- Cloudflare R2 data location: `https://developers.cloudflare.com/r2/reference/data-location/`
- Cloudflare R2 data security: `https://developers.cloudflare.com/r2/reference/data-security/`
- Backblaze B2 pricing: `https://www.backblaze.com/cloud-storage/transaction-pricing`
- Backblaze B2 Object Lock: `https://www.backblaze.com/docs/cloud-storage-object-lock`
- Backblaze B2 data regions: `https://www.backblaze.com/docs/cloud-storage-data-regions`
- Backblaze B2 application keys: `https://www.backblaze.com/docs/en/cloud-storage-application-keys`
- Wasabi product terms: `https://wasabi.com/product-terms`
- Amazon S3 pricing: `https://aws.amazon.com/s3/pricing/`
