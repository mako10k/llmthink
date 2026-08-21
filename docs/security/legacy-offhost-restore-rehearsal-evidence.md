# legacy off-host restore rehearsal evidence

- Status: completed; owner confirmed temporary Cloudflare credential revocation
- Date: 2026-08-21
- Authorization: `security/legacy-offhost-restore-rehearsal-authorization`
- Snapshot: `18c7800bf1020f1e431d00b765f29bfa848aec44367764394fb48424c85df826`

## Recovery independence

The owner created a fresh Object Read Only S3 credential restricted to the production bucket and
re-entered the repository password from the owner's password manager into a recovery-only ephemeral
entry. The rehearsal did not read the repository password from its persistent local `secdat` entry,
the ConoHa VPS, the VPS host credential key, or any VPS encrypted credential file.

Restic 0.19.1, its checksum list, signature, and the official signing-key file were newly downloaded
over HTTPS. The key file contained historical and current signing keys, so verification selected the
exact accepted fingerprint `CF8F18F2844575973F79D4E191A6868BD3F7A907`, then verified the signed
asset checksum, expanded binary digest
`20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639`, version, and platform.

## Read-only behavior correction

Direct S3 checks proved that the credential could read all six repository objects. The first restic
snapshot query nevertheless received `AccessDenied` because restic attempted to create a repository
lock object with `PutObject`, even for the read operation. This was not evidence of a wrong account
or invalid credential. The earlier endpoint-string mismatch was insufficient to establish account
identity and that inference was withdrawn.

The accepted recovery harness was corrected to pass restic's global `--no-lock` option to every
command. This made the execution genuinely compatible with Object Read Only authority: no lock,
write, delete, init, forget, prune, unlock, repair, or other repository mutation was attempted.

## Verified restore result

| Evidence                  | Result                                                             |
| ------------------------- | ------------------------------------------------------------------ |
| snapshot                  | `18c7800bf1020f1e431d00b765f29bfa848aec44367764394fb48424c85df826` |
| generation                | `eed8c2fb-4766-427d-816e-1bc6dc0d8c1e`                             |
| restic / repository       | 0.19.1 / format 2                                                  |
| restic commands           | 4                                                                  |
| full-data check           | passed                                                             |
| isolated restore          | passed                                                             |
| thought tree              | 34 files / 13,509 bytes / 25 directories                           |
| registry schema           | version 1 / 0 accounts                                             |
| manifest/component digest | passed                                                             |
| activation                | not performed                                                      |

After restore, the repository still contained exactly six objects, one snapshot object, and zero
lock objects. The isolated plaintext restore, restic cache, downloaded supply artifacts, verified
binary, and fixed owner-only temporary root were deleted. All four recovery-only ephemeral `secdat`
entries were deleted and confirmed absent.

## Credential revocation and acceptance

On 2026-08-21, the owner confirmed that the temporary Cloudflare Object Read Only credential had
been revoked. Together with deletion of all recovery-only ephemeral `secdat` entries and local
artifacts, this completes the rehearsal's credential-cleanup condition and full acceptance.

This evidence does not authorize a retry, repository mutation, production activation, persistent
restored copy, service, timer, or retention operation.
