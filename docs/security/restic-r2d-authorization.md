# disposable Cloudflare R2 test authorization

- Status: proposed
- Date: 2026-08-21
- Upstream: ADR-0013, ADR-0014, accepted restic R2 design and implementation plan
- Scope: one local synthetic compatibility test; no VPS secret placement or live data

## Proposed authorization

Authorize one bounded R2D execution with all of the following limits.

### External resources

- Create exactly one new dedicated private R2 bucket whose name starts with
  `llmthink-r2d-20260821-` and ends in a random non-identifying suffix.
- Select Standard storage and the APAC location hint. APAC is best effort, not a residency
  guarantee.
- Keep public development URL, custom domain, CORS, lifecycle rules, event notifications, data
  catalog, jurisdiction restriction, and Bucket Lock disabled.
- Create exactly one R2 S3 API credential with `Object Read & Write`, restricted to that exact
  bucket. It grants no account administration, other bucket, DNS, Worker, billing, or token-creation
  authority.
- Revoke the credential and delete the dedicated bucket after evidence is exported and the bucket
  is confirmed empty. Cleanup is intentionally destructive but is bounded to this newly created
  disposable bucket.

The bucket must be created before the bucket-specific credential. The operator retains Cloudflare
account authority and performs dashboard creation, token revocation, and final bucket deletion.

### Data and execution

- Execute from the local development machine, not the VPS, for this first R2D.
- Use generated synthetic SQLite/thought fixtures only, with at most 4 MiB plaintext input and no
  production identifier, path, content, hostname, tenant, email, or WorkOS value.
- Use a fresh random test-only restic repository password and the accepted verified restic 0.19.1
  Linux amd64 binary.
- Create at most three restic snapshots in one newly initialized repository.
- Run only: one `init`; at most three `backup`; exact `snapshots` rereads; one structural check; at
  most two full-data checks; one exact isolated restore; one retention dry-run; one retention apply
  against exact snapshot IDs; at most two `prune`; and final exact inventory/cleanup operations.
- Stop before automatic retry when exit, stderr, JSON, S3 response, snapshot identity, retention
  preview, restore validation, or cleanup target is ambiguous.
- Do not test Bucket Lock, public access, lifecycle expiry, production retention, cross-account
  recovery, or VPS-loss recovery in this execution.

### Credential handling

- Do not paste the Access Key ID or Secret Access Key into chat, Git, issue trackers, shell history,
  command arguments, test output, receipts, or general environment files.
- Place the two R2 credential values in the operator's existing local `secdat` boundary under
  R2D-only names. Inject them only into the bounded test process.
- Generate the restic password inside the disposable test boundary; never store it on the VPS.
- Record only the endpoint profile, anonymous bucket-profile digest, restic snapshot IDs, repository
  format, sizes, operation counts, results, and timestamps. Do not record credential fingerprints
  derived from secret material.
- Remove the R2D secrets from the local secret boundary after Cloudflare token revocation and
  evidence completion.

## Cost and write ceiling

- Hard stored-data ceiling: 20 MiB in the disposable bucket. Stop if observed use exceeds it.
- Hard operation ceiling: 2,000 Class A and 5,000 Class B requests attributable to this test. Stop
  rather than retry if the count cannot be bounded.
- Hard direct R2 charge ceiling for this execution: USD 1.00. Existing account-wide R2 usage is not
  controlled by this authorization and must be checked by the owner before execution.
- Standard currently includes a monthly free tier of 10 GB-month storage, one million Class A, ten
  million Class B operations, and free egress. This test should fit within it if the account has
  remaining allowance, but free execution is not guaranteed.

## Acceptance evidence

Success requires all of the following:

1. exact endpoint and private-bucket connectivity over TLS;
2. repository format 2 initialization without secret-bearing output;
3. synthetic backup and exact snapshot reread;
4. structural and full-data checks;
5. exact isolated restore and application-level restore validation;
6. retention preview matches exact synthetic snapshot expectations before apply;
7. prune and post-maintenance full-data check;
8. no secret or synthetic content in argv, logs, receipts, Git, or process evidence;
9. final object cleanup, token revocation, and bucket deletion confirmed by the owner;
10. a secret-free R2D evidence document distinguishing test success from live backup capability.

## Stop and residual-risk conditions

- Any accidental live-data selection, public access, wrong bucket/account, unbounded retry, cost
  ambiguity, credential exposure, or deletion ambiguity stops the test.
- R2 `Object Read & Write` permits deletion in the dedicated bucket. A leaked test credential can
  destroy or alter this disposable repository until revoked.
- Cloudflare account compromise, provider outage, and official-client compromise are not resolved
  by R2D.
- Successful local R2D does not prove VPS network behavior, recovery-secret custody, scheduled-job
  isolation, deletion resistance, restore activation, or production backup fitness.

## Owner actions after acceptance

1. Check current account-wide R2 usage and confirm the USD 1.00 ceiling is acceptable.
2. Create the exact private Standard/APAC disposable bucket in the Cloudflare dashboard.
3. Create one bucket-specific Object Read & Write S3 credential.
4. Store endpoint, Access Key ID, and Secret Access Key in local `secdat` without showing values in
   chat, then provide only the non-secret `secdat` entry names.
5. After test evidence is reviewed, revoke the token and delete the bucket when requested.

Acceptance authorizes only the bounded local R2D above. It does not authorize production bucket or
credential creation, VPS secret placement, VPS R2 access, live backup, systemd/timer activation,
retention automation, Bucket Lock, restore activation, or a public backup claim.

## Current official references

- R2 S3 bucket and bucket-specific credential procedure:
  `https://developers.cloudflare.com/r2/get-started/s3/`
- R2 pricing and free tier: `https://developers.cloudflare.com/r2/pricing/`
- R2 data location semantics: `https://developers.cloudflare.com/r2/reference/data-location/`
- R2 bucket deletion: `https://developers.cloudflare.com/r2/buckets/delete-buckets/`
