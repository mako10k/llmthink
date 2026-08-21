# legacy first encrypted live backup evidence

- Status: completed
- Date: 2026-08-21
- Scope: one manual legacy recovery generation and one encrypted production snapshot

## Reason for the bounded exception

The current hosted deployment predates the accepted lifecycle SQLite control plane. Read-only VPS
inventory found live thought data and the root-owned OAuth account registry, but no lifecycle
SQLite file and no deployed backup-generation module. Uploading the thought tree alone or inventing
an empty lifecycle database would have misrepresented the accepted control/data recovery contract.

The owner therefore accepted one current-state exception: capture the thought data and
`oauth-accounts.json` under a short service write pause, encode them as
`llmthink-legacy-recovery-generation-v1`, and store the result under a distinct legacy recovery tag.
This is manual-recovery evidence, not the normal SQLite-backed generation format.

## Recovery point

The hosted service stopped cleanly on `SIGTERM` at 16:05:03 JST. During the stopped interval, a
root-only one-shot harness copied only these fixed sources through no-follow file handles:

- `/var/lib/llmthink/data` to `thought-data`;
- `/etc/llmthink/oauth-accounts.json` to the legacy control mapping.

The prepared generation contained 34 thought files / 13,509 bytes and one 37-byte registry file.
The manifest contains only the format, opaque generation ID, recovery time, component names,
counts, sizes, and SHA-256 digests. It contains no account subject, tenant/workspace ID, thought ID,
content, absolute source path, endpoint, or secret.

The service was started in the same second and reported listening on loopback at 16:05:04 JST. It
remained active with zero automatic restarts after the backup, and the public status endpoint passed.

## Encrypted snapshot and restore verification

After service recovery, one collected transient systemd unit loaded the four host-encrypted
credentials and used the accepted restic 0.19.1 binary against the initialized production
repository.

| Evidence                 | Result                                                             |
| ------------------------ | ------------------------------------------------------------------ |
| generation               | `eed8c2fb-4766-427d-816e-1bc6dc0d8c1e`                             |
| snapshot                 | `18c7800bf1020f1e431d00b765f29bfa848aec44367764394fb48424c85df826` |
| repository format        | 2                                                                  |
| restic commands          | 5                                                                  |
| exact snapshot reread    | passed                                                             |
| structural check         | passed                                                             |
| full-data check          | passed                                                             |
| isolated restore digest  | passed                                                             |
| restored payload         | 36 files / 13,982 bytes                                            |
| journal secret scan      | no registered secret value present                                 |
| persistent service/timer | none                                                               |

The VPS plaintext generation, isolated restore/cache, and one-shot harness were removed only after
the exact snapshot, full-data check, and restored-tree digest passed. The encrypted repository and
snapshot remain in R2. No retention, forget, prune, Bucket Lock, automatic schedule, or restore
activation was performed.

## Boundary and next gates

This snapshot provides a tested manual recovery point for the current legacy deployment. It does
not establish the accepted SQLite-backed scheduled backup capability, tenant-aware automatic
restore, a retention history, freshness monitoring, or deletion resistance.

Before public enrollment or representing the normal backup feature as active:

1. update the draft Privacy Notice, whose current text still says no external dedicated backup
   provider is active;
2. define and test the manual legacy restore procedure from only off-host recovery custody;
3. deploy the lifecycle SQLite generation boundary or explicitly accept a longer-lived legacy
   backup contract;
4. separately approve any persistent service/timer and retention policy.
