# disposable Cloudflare R2 compatibility evidence

- Status: technical test passed; credential revocation and bucket deletion pending owner confirmation
- Date: 2026-08-21
- Authorization: `security/restic-r2d-authorization`
- Scope: local client, private disposable bucket, synthetic data only

## Final technical result

The corrected bounded R2D harness passed against the dedicated Cloudflare R2 Standard/APAC-hint
bucket through the S3-compatible API.

| Evidence                            | Result              |
| ----------------------------------- | ------------------- |
| restic version                      | 0.19.1              |
| repository format                   | 2                   |
| snapshots created                   | 3                   |
| synthetic plaintext processed       | 3,145,728 bytes     |
| stored objects before final cleanup | 9                   |
| stored bytes before final cleanup   | 2,102,390 bytes     |
| bounded command invocations         | 22                  |
| final bucket inventory              | 0 objects / 0 bytes |
| secret value emitted                | none observed       |
| repository cleanup                  | passed              |

The session verified exact private endpoint connectivity, repository initialization, changed
synthetic backups, exact snapshot rereads, structural check, two full-data checks, exact isolated
restore digest, retention dry-run non-mutation, exact retention apply, prune, post-maintenance
check, exact remaining-snapshot deletion, and final object cleanup.

## Corrective attempts

Attempt 1 stopped after initialization and one backup because the harness used a positional path
filter that caused a successful restic snapshot listing to emit an informational stderr line. The
bucket was returned from 6 objects / 1,051,461 bytes to empty before correction.

Attempt 2 reached all three backups, structural/full-data checks, and exact restore. It stopped at
retention dry-run because restic emits the fixed informational stderr line
`Ignoring "filters": explicit snapshot ids are given`. The bucket was returned from 14 objects /
3,153,588 bytes to empty before correction.

A local repository reproduced that exact output. The harness now permits only that complete line
for exact-ID forget operations; any other stderr still fails closed. The final execution then
passed. These corrections were performed inside the same synthetic R2D session in response to the
owner's request for proportional rather than per-command approval.

## Cost proportionality

The technical run stayed far below the accepted ceilings. The detailed byte/object ceilings acted
as wrong-target and runaway guards, not as a claim that normal use near the R2 Standard free tier is
dangerous. Future synthetic corrective retries within one authorized session do not require a new
owner gate when all of the following remain unchanged: exact dedicated bucket, synthetic-only data,
same credential scope, empty start, same destructive cleanup target, no secret exposure, and no
scope or cost expansion.

## Remaining gate

The bucket is technically empty, but the Cloudflare credential and bucket still exist. The owner
must revoke the R2D credential and delete the exact disposable bucket. Until both are confirmed,
this evidence remains draft and the full R2D acceptance condition is incomplete.

Successful R2D does not authorize or prove production credential custody, VPS R2 access, scheduled
backup, live data transfer, deletion resistance, restore activation, or public backup capability.
