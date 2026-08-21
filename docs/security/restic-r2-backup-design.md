# restic + Cloudflare R2 backup design

- Status: accepted
- Date: 2026-08-21
- Storage decision: ADR-0013
- Threat-model input: `docs/security/backup-threat-model.md`
- Scope: client, encrypted repository, credentials, retention, verification, and restore design

## 1. Decision

Use restic with Cloudflare R2 Standard through the S3-compatible API as the initial encrypted
backup mechanism. Keep account/bucket administration and recovery custody outside the VPS.

Owner acceptance was recorded on 2026-08-21. It does not authorize installation, account or bucket creation,
credential generation, secret placement, upload, retention lock, restore, or Production change.

## 2. Client comparison

| Client pattern               | Strengths                                                                                                                                                                    | Costs and gaps                                                                                                                                                    | Initial decision                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| restic directly to R2 S3     | Authenticated encrypted repository, snapshots, deduplication, compression, retention policy, integrity check, full-data check, restore, JSON output, one static-style client | Repository password and R2 credential must be available during backup; prune requires delete access; SQLite consistency still needs an external snapshot step     | Recommend                                           |
| Kopia directly to R2 S3      | Encryption, policies, snapshots, maintenance, compression, S3 support, optional server/UI                                                                                    | More policy and maintenance modes than needed; larger operational surface for a single tiny service                                                               | Defer                                               |
| rclone crypt plus copy/sync  | Broad R2 support, client-side filename/content encryption, simple transfer                                                                                                   | Sync/copy is not by itself a coherent backup history; deletion/corruption can be propagated; retention, manifest, and restore acceptance must be built separately | Reject as primary backup; may be a transport helper |
| Borg plus rclone/SFTP bridge | Mature encrypted deduplicated repositories and append-only patterns                                                                                                          | No direct R2 backend; extra repository/transport layer and more failure modes                                                                                     | Defer                                               |
| Custom archive plus S3 SDK   | Exact control over manifest and generation model                                                                                                                             | Reimplements encryption format, deduplication, retention, repair, compatibility, and restore tooling                                                              | Reject                                              |

Restic's own documentation supports S3-compatible storage, encrypted repositories, snapshot
retention with `forget`, data reclamation with `prune`, integrity checking, and restore. The
repository format and restic version remain part of restore compatibility evidence.

## 3. Data flow

```text
live thought data ─┐
                   ├─> bounded local snapshot area
SQLite online copy ┘       │
                           ├─> manifest and source checks
                           │
                           └─> restic authenticated encrypted repository
                                      │ TLS + S3 signature
                                      v
                              private Cloudflare R2 bucket
```

R2 never receives the plaintext repository password. R2's provider-managed encryption at rest
is defense in depth, not the P0 confidentiality boundary.

The snapshot area is temporary, permission-protected, on an explicit path, and removed only
after restic success plus repository observation. It must not contain a raw copy longer than
needed for the bounded job.

## 4. Source and consistency boundary

The backup job does not point restic directly at a changing SQLite main file.

1. Create a new absent local generation directory with restrictive ownership and mode.
2. Inventory only explicit allowlisted sources.
3. Create the lifecycle database copy with the SQLite online backup API or accepted equivalent.
4. Establish a bounded thought-data recovery point. The initial implementation may briefly
   pause hosted writes while it freezes the control/data generation; it must not claim atomicity
   if only later reconciliation is available.
5. Write a manifest containing only safe generation metadata, schema/repository format, sizes,
   and digests.
6. Run restic against that generation directory.
7. Confirm the new snapshot exists by exact snapshot ID and expected tags/host identity.
8. Produce a secret-free receipt and clean the plaintext snapshot area.

Symlinks, unexpected mounts, devices, sockets, absolute escape paths, and unresolved source
variables fail the job before any upload.

## 5. Repository profile

- Backend: R2 S3-compatible endpoint.
- Repository: one dedicated restic repository in one private bucket/prefix.
- Restic release: pin an explicitly accepted version and verify the official binary before
  installation; do not use `self-update` in the scheduled job.
- Repository format: record exact format version in receipts and restore documentation; migration
  is a separately backed-up and rehearsed operation.
- Compression: `auto` initially; optimization is not a security decision.
- Cache: dedicated non-shared local cache under the backup service account; cache is disposable
  and excluded from backup.
- Identity: fixed non-personal restic host/tag values, not the VPS hostname if it reveals operator
  or provider details.
- Snapshot tags: versioned safe tags for component and generation only.
- Locking: one scheduled writer; overlapping jobs fail or skip without using unsafe unlock.
- Network: S3 endpoint over TLS only; no public bucket domain.

## 6. Credential and key custody

### 6.1 Separate authorities

| Authority                                | Needed on VPS?                | Purpose                                                               | Must not grant                                                               |
| ---------------------------------------- | ----------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| restic repository password               | Yes, during the scheduled job | Derive/unlock client-side repository encryption keys                  | Cloudflare account or bucket administration                                  |
| R2 runtime access key                    | Yes, during the scheduled job | Access only the dedicated private bucket through S3                   | Account administration, other buckets, DNS, Workers, billing, token creation |
| Cloudflare account/admin access          | No                            | Create bucket/token, rotate/revoke, inspect billing and lock settings | Routine scheduled-job execution                                              |
| restic recovery copy                     | No                            | Recover repository when VPS and its runtime secret copy are lost      | R2 account administration                                                    |
| Cloudflare account recovery/MFA material | No                            | Regain provider control and issue a replacement read credential       | Restic repository decryption by itself                                       |

### 6.2 VPS runtime custody

- Use two independent high-entropy secrets: the restic repository password and R2 secret access
  key.
- Store them in root-owned service credentials outside Git, the package directory, data root,
  logs, command-line arguments, and general environment files.
- Supply them to a dedicated, non-interactive backup unit using systemd credential files or an
  equivalent bounded mechanism. The wrapper may expose values only to the child process as
  required by restic/AWS SDK conventions and must unset them before invoking unrelated tools.
- Do not store the Cloudflare administrative token or account recovery material on the VPS.
- Run backup with the least OS access that can read the prepared snapshot area; do not grant it
  an unrestricted home directory or host filesystem.

Systemd credential encryption tied only to the ConoHa machine is not an off-host recovery copy.
It may protect the runtime presentation but cannot satisfy ConoHa-loss recovery.

### 6.3 Off-host recovery custody

Maintain two logically separate recovery capabilities outside ConoHa:

1. a protected copy of the restic repository password;
2. Cloudflare account recovery/MFA capability sufficient to issue a new bucket-scoped read
   credential.

Recommended initial custody is the operator's existing secret-management boundary plus one
independent encrypted/offline recovery copy. Neither location, label, nor handoff document may
contain the secret value. Recovery evidence records only existence, version, last verification,
and a non-secret fingerprint where safe.

Loss of one ordinary operator device is P1, so the second recovery copy may be manual. It must
not be kept only on the ConoHa VPS or only inside the same Cloudflare account.

## 7. Deletion resistance and honest gap

Restic `forget` removes snapshot metadata and `prune` requires full read/write/delete access to
reclaim unreferenced pack data. Restic documentation warns that append-only protection is lost
when a compromised client holds full maintenance access.

R2's bucket-scoped Object Read & Write token does not provide a proven restic-compatible
write-without-delete profile for this design. Therefore:

- the first implementation must not claim append-only or ransomware-proof backup;
- the VPS runtime credential may be able to delete repository objects, which leaves BTH-03,
  BTH-04, and BTH-10 partially unmet at P1;
- Cloudflare account/bucket administration remains off the VPS, satisfying separation from
  wider account control but not complete repository deletion resistance;
- scheduled retention maintenance uses the same bounded runtime only after a dry-run and exact
  repository selection; ambiguous output stops;
- Bucket Lock is deferred until a disposable R2 repository test proves compatible behavior for
  backup, lock creation, `forget`, `prune`, expiration, check, and restore;
- a short recent-object lock may later reduce accidental deletion, but must not silently extend
  the public 30-day retention or cause prune failures to be reported as success.

This P1 gap is acceptable for the unpaid trial only if owner acceptance remains explicit and
freshness/check/restore evidence is present.

## 8. Retention and verification profile

Proposed initial policy:

- create one snapshot per successful daily generation;
- retain all snapshots within the most recent 30 days using a time-window policy rather than
  only “last N” snapshots;
- preview retention changes before applying them during manual acceptance and after any policy
  change;
- run structural `restic check` regularly;
- run `restic check --read-data` before activation and at the P1 rehearsal interval, because the
  ordinary structural check does not read and verify every pack;
- restore an exact snapshot into an absent isolated path before activation and after material
  client, repository-format, key, or infrastructure changes;
- record exact snapshot ID, repository format, restic version, manifest digest, check mode,
  result, size, and time without source paths or content.

The exact `forget` options are implementation details and must be proven against generated
fixtures. A policy must never use an unsafe remove-all option in scheduled operation.

## 9. Failure behavior

- Snapshot preparation failure: upload nothing and retain no success receipt.
- Upload or ambiguous S3 response: do not finalize success; re-read exact snapshot state before
  deciding whether a safe retry exists.
- Restic warning or non-zero exit: fail the generation unless the exact exit contract was
  reviewed and explicitly classified.
- Repository check failure: suspend pruning and new acceptance claims; preserve evidence and
  assess restoreability.
- Stale generation: report the last accepted recovery point, not merely the last job execution.
- Secret or credential exposure: revoke/rotate the affected R2 key or restic key path, then
  reassess historical confidentiality and restoreability.
- Cleanup failure: treat remaining plaintext snapshot data as a security incident requiring
  bounded cleanup; do not log its contents or broad path inventory.

## 10. Acceptance evidence before external setup

The implementation plan must include local/disposable tests for:

- SQLite online backup during WAL writes;
- thought/control recovery-point manifest;
- restic repository initialization without secret-bearing output;
- unchanged and changed daily snapshots;
- interrupted upload and exact reread;
- wrong password, wrong R2 credential, wrong repository, and wrong snapshot rejection;
- corruption detection by structural and full-data checks;
- 30-day time-window retention preview and application;
- isolated restore, path-safety checks, lifecycle fsck, and tenant reconciliation;
- loss of the VPS with recovery using only the off-host recovery capabilities;
- logs, receipts, process arguments, journal, and test fixtures containing no secret or content;
- pinned binary verification and explicit repository-format compatibility.

## 11. Alternatives and reconsideration

Reconsider Kopia when centralized policy/UI or multi-host scheduling would materially reduce
operations. Reconsider an independently operated receiving API, append-only rest-server, or
rclone bridge only when deletion resistance is promoted to P0 and the added service can keep
physical deletion authority outside a compromised VPS. Reconsider a custom generation archive
only if restic repository semantics prevent required tenant-safe recovery or bounded retention.

## 12. Accepted owner decisions

The owner accepted the following on 2026-08-21:

1. restic as the initial client;
2. the two-secret runtime model: restic repository password plus bucket-scoped R2 key;
3. root-owned/systemd-bounded runtime presentation on the VPS;
4. off-host recovery using the existing secret-management boundary plus one independent
   encrypted/offline copy;
5. the initial P1 deletion-resistance gap and deferral of Bucket Lock until disposable testing;
6. 30-day time-window retention, structural checks, periodic full-data checks, and isolated
   restore rehearsal.

Acceptance authorizes an implementation plan and local/disposable test design only. The owner
explicitly accepts the initial residual risk that compromise of the VPS runtime credential may
permit repository deletion. External R2
setup, credential creation, secret placement, software installation on the VPS, live upload, and
restore remain separately gated.

## 13. Official sources checked

- restic documentation: `https://restic.readthedocs.io/en/stable/`
- restic repository checks and compatibility:
  `https://restic.readthedocs.io/en/stable/045_working_with_repos.html`
- restic retention and append-only considerations:
  `https://restic.readthedocs.io/en/stable/060_forget.html`
- Cloudflare R2 S3 API: `https://developers.cloudflare.com/r2/api/`
- Cloudflare R2 consistency: `https://developers.cloudflare.com/r2/reference/consistency/`
- Cloudflare R2 durability: `https://developers.cloudflare.com/r2/reference/durability/`
- Cloudflare R2 security: `https://developers.cloudflare.com/r2/reference/data-security/`
