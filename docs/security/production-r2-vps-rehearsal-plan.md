# production R2 profile and VPS synthetic rehearsal plan

- Status: proposed
- Date: 2026-08-21
- Inputs: accepted R2/restic design, ADR-0013, ADR-0014, completed R2D evidence
- Scope: production storage/credential profile and synthetic VPS route rehearsal only

## Proposed external profile

- Create one private Cloudflare R2 bucket named `llmthink-backup-3b38f07b`.
- Use Standard storage and the APAC location hint. Do not claim residency.
- Keep public development URL, custom domain, CORS, event notifications, Data Catalog, lifecycle
  rules, jurisdiction restriction, and Bucket Lock disabled for the rehearsal.
- Create one long-lived S3 credential with `Object Read & Write`, restricted to this exact bucket.
- Grant no Cloudflare account administration, bucket creation/deletion, other bucket, DNS, Worker,
  billing, or token-creation authority.

This credential is the future bounded backup runtime credential. It may delete objects in its exact
bucket, preserving the accepted P1 deletion-resistance gap. The Cloudflare account and ability to
revoke/reissue the credential remain off the VPS.

## Credential delivery

The owner stores endpoint, Access Key ID, and Secret Access Key under new production-only names in
the existing local secdat boundary. No value is pasted into chat or written to Git, argv, shell
history, ordinary environment files, or the hosted service configuration.

After metadata-only checks and a dry-run, each value is transported over the approved SSH
ProxyJump as standard input to root-owned `systemd-creds encrypt --with-key=host`. The VPS receives
three absent encrypted credential files:

- `/etc/credstore.encrypted/llmthink-r2-endpoint`
- `/etc/credstore.encrypted/llmthink-r2-access-key-id`
- `/etc/credstore.encrypted/llmthink-r2-secret-access-key`

Each file is `root:root 0600`. Host-bound encryption is runtime presentation, not off-host recovery
custody. The R2 S3 credential can be revoked and reissued through the separately held Cloudflare
account; the future restic repository password requires separate off-host recovery custody and is
not created in this stage.

## VPS rehearsal

Install a reviewed root-owned rehearsal harness and execute it once through a transient systemd
unit with `LoadCredentialEncrypted`. The unit receives the decrypted values only under its private
`/run/credentials` directory. It does not add a persistent service or timer.

The harness:

1. confirms accepted restic 0.19.1 and the three credential files;
2. creates a root-only temporary source, cache, restore root, and random test-only restic password;
3. selects one new opaque prefix under `rehearsal/`, never the future live repository prefix;
4. initializes repository format 2 and writes one small synthetic snapshot;
5. performs exact snapshot reread, structural/full-data check, and exact isolated restore digest;
6. forgets the exact snapshot and prunes;
7. emits a secret-free result and destroys plaintext/password/cache/restore temporary state.

The VPS has no AWS CLI. After the transient unit completes, the local AWS CLI uses the same
secdat-injected bucket credential to inventory only the exact rehearsal prefix, delete its remaining
restic config/key objects, and confirm the prefix and bucket contain no rehearsal objects. The
production bucket and credential remain for the later live-backup gate.

## Proportional guards

- Use one snapshot with at most 1 MiB synthetic plaintext.
- Stop on a wrong account/bucket, non-empty selected rehearsal prefix, secret exposure, ambiguous
  output, failed check/restore, or uncertain cleanup target.
- Do not treat the R2 free tier as a reason for per-command approval. These size/object checks exist
  only to detect a wrong target or runaway execution.
- Corrective retries inside the same authorized synthetic session may proceed without another
  owner gate when the exact bucket, prefix family, credential scope, secret boundary, and cleanup
  authority do not change.

## Acceptance evidence

- bucket profile and credential scope confirmed without secret values;
- encrypted credential paths, ownership, mode, and systemd load success;
- VPS-to-R2 TLS/S3 connectivity and format 2 initialization;
- backup, exact reread, full-data check, restore digest, forget, and prune;
- process argv/journal/receipt scan contains no secret or synthetic content;
- exact rehearsal prefix cleanup and empty inventory;
- no persistent systemd unit/timer and no live repository password or data;
- local production secdat staging entries removed after encrypted delivery and cleanup.

## Approval boundary

Acceptance authorizes the exact bucket and bucket-specific credential creation, encrypted delivery
to the VPS, installation/execution/removal of the transient synthetic rehearsal harness, and exact
rehearsal-prefix cleanup. It does not authorize a production restic password, live repository
initialization, live data backup, scheduled service/timer, retention automation, Bucket Lock,
restore activation, Privacy Notice backup claim, or public enrollment.

## Owner actions after acceptance

1. Create `llmthink-backup-3b38f07b` as private Standard/APAC in the Cloudflare dashboard.
2. Create one bucket-specific `Object Read & Write` S3 credential and retain its revocation path.
3. Store endpoint, Access Key ID, and Secret Access Key under the production secdat entry names
   provided after acceptance; disclose only completion, never the values.
