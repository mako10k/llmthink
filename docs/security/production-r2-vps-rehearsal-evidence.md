# production R2 profile and VPS synthetic rehearsal evidence

- Status: completed
- Date: 2026-08-21
- Plan: `security/production-r2-vps-rehearsal-plan`
- Scope: production bucket/credential delivery and synthetic rehearsal only

## Result

The owner created the accepted private R2 Standard/APAC-hint bucket and exact-bucket Object Read &
Write S3 credential. The bucket was reachable and empty before the rehearsal.

The three values were initially registered under names containing an extra `D`. A value-free
`secdat mv` was attempted, stopped before mutation because the v2 global dependency index was
missing, and succeeded only after the documented dependency-index check and rebuild. No secret
value was read or printed.

## VPS credential delivery

The VPS created a 4096-byte systemd host credential key. systemd warned that the host key file is
not on encrypted media. This is consistent with the accepted limitation: host-bound credential
encryption prevents ordinary plaintext credential files but is not protection from VPS/root
compromise or an off-host recovery copy.

The values traveled through the approved SSH ProxyJump as standard input to `systemd-creds
encrypt --with-key=host`. The resulting files are:

- `/etc/credstore.encrypted/llmthink-r2-endpoint`: `root:root 0600`
- `/etc/credstore.encrypted/llmthink-r2-access-key-id`: `root:root 0600`
- `/etc/credstore.encrypted/llmthink-r2-secret-access-key`: `root:root 0600`

The bucket-specific Cloudflare credential remains active and the encrypted files remain on the VPS
for a separately gated future backup runtime. The Cloudflare account/revocation path remains
off-host.

## Transient rehearsal result

One collected transient systemd unit loaded the three encrypted credentials into its private
runtime credential directory. It used the accepted `/opt/llmthink/bin/restic-0.19.1` binary and an
ephemeral random test password against one opaque `rehearsal/` prefix.

| Evidence                      | Result                                                             |
| ----------------------------- | ------------------------------------------------------------------ |
| unit result                   | success                                                            |
| restic / repository format    | 0.19.1 / 2                                                         |
| synthetic plaintext           | 1,048,576 bytes                                                    |
| restic commands               | 9                                                                  |
| snapshot                      | `589e8bd0fa6123559d4ea57f7f83422a42e8dcca80c115240e669c8586b04e17` |
| backup / exact reread         | passed                                                             |
| structural / full-data check  | passed                                                             |
| isolated restore digest       | passed                                                             |
| exact forget / prune          | passed                                                             |
| post-prune repository objects | 2 objects / 611 bytes, both inside the exact rehearsal prefix      |
| final production bucket       | 0 objects / 0 bytes                                                |
| journal secret scan           | no registered secret value present in 379 bytes                    |
| persistent backup units       | 0                                                                  |

The local AWS CLI removed only `rehearsal/0088da7f3b32d0f6` after proving every bucket object was
inside that prefix, then confirmed an empty bucket. The transient unit was collected, the reviewed
rehearsal harness was removed from the VPS, and local plaintext staging entries
`LLMTHINK_R2_ENDPOINT`, `LLMTHINK_R2_ACCESS_KEY_ID`, and `LLMTHINK_R2_SECRET_ACCESS_KEY` were deleted
after mask-impact dry-runs. Unrelated `LLMTHINK_R2D_TOKEN` and `R2D_TOKEN` entries were not modified.

## Boundary and frontier

No production restic repository password, live repository, live data, service, timer, retention
automation, Bucket Lock, restore activation, or public backup claim was created. The bucket is
empty but intentionally retained, and the production R2 runtime credential intentionally remains
encrypted on the VPS.

The rehearsal establishes VPS-to-R2 connectivity and credential presentation, not production
backup capability. The next decision is the production repository password/recovery-custody
ceremony and first empty live-repository initialization. Live data and scheduling remain later
independent gates.
