# production R2 empty repository initialization evidence

- Status: completed
- Date: 2026-08-21
- Scope: recovery custody, VPS runtime password delivery, and empty repository initialization only

## Result

The owner confirmed that the production restic repository password is held in the owner's personal
password manager. The same generated secret remains in the operator's local `secdat` boundary.
These are the two accepted off-ConoHa recovery copies; the secret value is not recorded here.

The repository password was delivered through the approved SSH ProxyJump as standard input to
`systemd-creds encrypt --with-key=host`. The VPS runtime copy is:

- `/etc/credstore.encrypted/llmthink-restic-repository-password`: `root:root 0600`

As recorded for the R2 credentials, systemd warns that the VPS host credential key is not on
encrypted media. This host-bound copy is runtime presentation only and is not counted as an
off-host recovery copy.

## Initialization and verification

A reviewed one-shot harness used the accepted `/opt/llmthink/bin/restic-0.19.1` binary and the four
encrypted systemd credentials in one collected transient unit. It addressed the root of the
dedicated private bucket `llmthink-backup-3b38f07b` and performed only:

1. `init --repository-version 2`;
2. structural `check`;
3. `check --read-data`;
4. exact JSON snapshot enumeration.

The accepted result was:

| Evidence                    | Result                             |
| --------------------------- | ---------------------------------- |
| unit result                 | success                            |
| restic / repository format  | 0.19.1 / 2                         |
| snapshots                   | 0                                  |
| restic commands             | 4                                  |
| live data uploaded          | false                              |
| journal secret-value scan   | no registered secret value present |
| persistent service or timer | none                               |

The first transient invocation stopped before executing the harness with
`status=243/CREDENTIALS`: the encrypted repository-password blob embedded its output filename
instead of the requested runtime credential name. No R2 command ran in that attempt. The exact
credential was re-encrypted with embedded name `repository_password`, after which initialization
and all readback checks passed.

The transient harness was removed from the VPS after verification. All four encrypted runtime
credential files remain `root:root 0600` for a separately gated future backup runtime.

## Boundary and frontier

The R2 bucket now contains an initialized, encrypted, empty production restic repository. It is no
longer an empty R2 bucket and must not be deleted as rehearsal cleanup.

No llmthink user data, synthetic snapshot, backup generation, service, timer, retention operation,
restore activation, or public backup-capability claim was created. The next independent decision is
the first encrypted live backup. Persistent service/timer activation remains a later decision even
after that backup succeeds.
