# disposable R2 test attempt 1 evidence

- Status: failed closed and cleaned
- Date: 2026-08-21
- Authorization: `security/restic-r2d-authorization`
- Data: generated synthetic fixture only

## Achieved scope

- the exact private bucket was reachable with the bucket-specific credential;
- the bucket was empty before repository initialization;
- accepted restic 0.19.1 passed the pinned binary digest check;
- repository format 2 initialization and the first 1 MiB synthetic backup reached R2;
- no secret value was written to argv, output, Git, receipt, or chat;
- after the fail-closed stop, the dedicated bucket contained 6 objects totaling 1,051,461 bytes;
- exact dedicated-bucket cleanup completed and a final inventory returned 0 objects and 0 bytes.

## Earliest failure

The first snapshot inventory command exited successfully but emitted an informational filter
message on stderr because the harness supplied the source as a positional filter. The harness
classifies every unexpected stderr result as ambiguous and stopped before the second backup,
checks, restore, retention, or prune.

The existing accepted adapter already avoids this restic behavior by using the explicit
`--path <exact-path>` filter. The R2D harness was corrected to use the same command shape. This is a
harness command-contract defect, not evidence that R2 snapshot listing failed.

## Invalidation and frontier

This attempt does not establish R2D compatibility. Initialization and first-upload observations
remain useful but cannot substitute for full-data check, restore, retention, prune, or final
acceptance. The authorized one-shot execution was consumed, so the corrected harness will not be
run externally without fresh owner authorization.

The next bounded action is one retry against the same now-empty dedicated bucket and existing
short-lived credential, under the unchanged data, operation, cost, cleanup, and stop ceilings. It
must start by proving the bucket is still empty.
