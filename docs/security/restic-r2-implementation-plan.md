# restic + R2 backup implementation and disposable-test plan

- Status: draft for owner review
- Date: 2026-08-21
- Accepted design: `docs/security/restic-r2-backup-design.md`
- Scope: local implementation slices, disposable tests, evidence, and external activation gates

## 1. Outcome and authority boundary

Implement a deterministic backup pipeline that prepares a consistent, tenant-safe local recovery
generation and invokes a pinned restic client through a narrow adapter. Prove the pipeline first
against a local disposable restic repository, then against a separately authorized disposable R2
repository.

This plan does not authorize creating an R2 bucket or credential, installing software on the VPS,
placing secrets, uploading live data, enabling a timer, restoring production data, or activating a
restored generation.

## 2. Deliverable boundary

The application owns generation consistency, manifests, path safety, receipts, and restore
validation. Restic owns encrypted repository storage, snapshot identity, pack integrity, retention,
and extraction. A shell or systemd wrapper owns only credential presentation and process
orchestration; it must not infer tenants, enumerate arbitrary paths, or parse user content.

Proposed repository additions:

| Path                                    | Responsibility                                                  |
| --------------------------------------- | --------------------------------------------------------------- |
| `src/server/backup/contracts.ts`        | Versioned manifest, receipt, command result, and failure types  |
| `src/server/backup/generation.ts`       | Create an absent bounded generation from explicit sources       |
| `src/server/backup/sqlite-snapshot.ts`  | SQLite-supported online copy and validation                     |
| `src/server/backup/thought-snapshot.ts` | Freeze or reconcile the thought-data recovery point             |
| `src/server/backup/restic.ts`           | Spawn pinned restic with fixed arguments and JSON parsing       |
| `src/server/backup/restore.ts`          | Extract to an absent path and perform pre-activation checks     |
| `src/server/backup/cli.ts`              | Explicit operator commands; no scheduled policy decisions       |
| `test/server/backup/*.test.ts`          | Local fixtures, negative cases, interruption, and restore tests |
| `ops/backup/`                           | Reviewed systemd templates and secret-free operator runbook     |

Exact names may change during implementation, but the boundaries must not collapse into the
existing request-serving process.

## 3. Versioned local contracts

### 3.1 Generation manifest

The canonical JSON manifest uses stable key ordering and contains only:

- format identifier and version;
- random opaque generation ID;
- UTC creation and recovery-point times;
- lifecycle schema version and SQLite snapshot digest/size;
- thought repository format and opaque generation digest/size;
- component-relative allowlisted names;
- producer version and non-personal profile ID.

It contains no email, WorkOS subject, tenant/workspace ID, thought reference, content, absolute
path, hostname, bucket, endpoint, credential label, or secret-derived fingerprint.

### 3.2 Backup receipt

A success receipt is written only after an exact restic snapshot reread. It records the manifest
digest, opaque restic snapshot ID, repository format, restic version, fixed tags, byte counts,
check state, and timestamps. An ambiguous command result produces a separate failure observation,
not a success receipt.

### 3.3 Restore report

The restore report records the selected snapshot and manifest digest, isolated target identity,
SQLite checks, thought-repository validation, ownership reconciliation counts, and pass/fail
results. It contains no restored values or identifying paths. It never authorizes activation.

## 4. Implementation slices

### Slice A: pure contracts and path policy

- Define strict parsers for manifests, receipts, and restic JSON output.
- Resolve every source and destination from explicit absolute configuration at startup.
- Require generation and restore destinations to be absent and beneath fixed roots.
- Reject symlinks, devices, sockets, unexpected mounts, traversal, and source/destination overlap.
- Make logs structured and secret-free by construction.

Exit evidence: unit tests cover canonical encoding, unknown fields, malformed IDs, path escape,
symlink swap, and redaction.

### Slice B: consistent local generation

- Add an SQLite online-backup operation to the lifecycle-store boundary; do not copy the main DB
  file directly.
- Validate the copied database with `integrity_check`, `foreign_key_check`, expected schema
  version, and invariant queries.
- Freeze the thought repository under a bounded write pause for the initial trial, or record an
  explicit reconciliation boundary if the implementation cannot make both planes atomic.
- Copy only allowlisted regular files into a newly created mode-restricted generation directory.
- Write the manifest last and fsync the required file/directory boundaries before declaring the
  generation ready.

Exit evidence: concurrent WAL writes restore all committed rows and no partial transaction;
thought/control skew is detected rather than guessed.

### Slice C: restic process adapter

- Accept the restic executable path, repository selector, password-file descriptor/path, and S3
  credential delivery only from validated operator configuration.
- Use an exact argument vector; never invoke a shell or include secrets in arguments.
- Pin and verify an accepted restic version outside the scheduled job.
- Initialize only an explicitly empty disposable repository.
- Back up exactly one prepared generation with fixed safe host/tag values.
- Parse JSON output and reread the exact snapshot before issuing a receipt.
- Treat non-zero exit, warning-classified output, unknown JSON, timeout, and signal termination as
  failure or ambiguity.

Exit evidence: a fake-restic harness verifies arguments/environment/redaction; a real local
repository verifies init, backup, snapshots, check, restore, forget preview, and prune.

### Slice D: isolated restore validator

- Restore an exact snapshot ID into a newly created absent directory outside live roots.
- Verify the canonical manifest and every declared component digest before parsing content.
- Open the restored SQLite database read-only and run schema, integrity, foreign-key, and ownership
  invariant checks.
- Validate thought repository format and reconcile every restored ownership relation against the
  restored control plane.
- Fail closed on missing, orphaned, conflicting, or multi-owner data; never repair automatically.
- Produce a secret-free report and stop before activation.

Exit evidence: valid restore succeeds; wrong repository/password/snapshot, corruption, traversal,
missing ownership, and cross-tenant fixtures fail before activation.

### Slice E: operational packaging

- Provide a dedicated non-interactive service account and root-controlled preparation boundary.
- Use systemd credentials or equivalent bounded runtime delivery for the two independent secrets.
- Separate daily backup from retention maintenance so failure of `forget`/`prune` cannot falsify
  backup freshness.
- Prevent overlap with an explicit lock and never use automatic unsafe unlock.
- Set restrictive filesystem, process, syscall, home, temporary-directory, and network policy as
  compatible with the pinned restic binary and R2 endpoint.
- Emit a local secret-free freshness receipt suitable for status monitoring.

Exit evidence: static unit review, sandboxed service test, process-argument inspection, journal
inspection, and failure-injection results. VPS installation remains a later authorization.

## 5. Disposable test stages

### Stage L0: no restic process

Use generated SQLite and thought fixtures only. Test path rules, WAL consistency, manifests,
receipts, reconciliation, cleanup, and deterministic failure behavior.

### Stage L1: local restic repository

Use a temporary filesystem repository and random test-only password created inside the test
process. Exercise two changed generations, one unchanged generation, corruption detection,
retention preview/application, full-data check, and isolated restore. Delete only the explicitly
created temporary test root after validating it is beneath the test harness root.

### Stage L2: disposable S3-compatible emulator

If needed to test interrupted and ambiguous S3 responses, run a local disposable emulator with
synthetic credentials and no external network dependency. The emulator is behavioral test
evidence, not proof of R2 compatibility.

### Stage R2D: disposable R2 repository

This stage requires separate owner authorization. Use a new empty test bucket or prefix, dedicated
short-lived bucket-scoped credentials, synthetic non-user fixtures, and a test-only restic
password. Prove endpoint/TLS behavior, backup, exact reread, check, full restore, retention,
prune, and cleanup. Test Bucket Lock only here and never against the future live repository.

No production/VPS credential or live llmthink data is used in L0, L1, L2, or R2D.

## 6. Acceptance matrix

| Case                                 | Required result                                                            |
| ------------------------------------ | -------------------------------------------------------------------------- |
| Active SQLite WAL writes             | All committed rows at the recovery point restore; no partial transaction   |
| Thought/control mutation race        | One bounded recovery point or explicit fail-closed reconciliation          |
| Repeated backup                      | New exact snapshot receipt without overwriting prior accepted generation   |
| Interrupted upload                   | No success receipt; exact reread determines whether retry is safe          |
| Wrong password/credential/repository | Fail without fallback or repository initialization                         |
| Corrupt pack/manifest                | Check or pre-restore authentication rejects it                             |
| Malicious archive path or symlink    | Reject before writing outside the isolated root                            |
| Missing/conflicting ownership        | Restore validation fails without reassignment                              |
| 30-day retention                     | Preview matches fixtures; scheduled policy cannot remove all snapshots     |
| Secret/content scan                  | Arguments, journal, receipts, errors, and fixtures contain none            |
| VPS loss rehearsal                   | Off-host password custody plus new read credential restores synthetic data |

## 7. Safe command model

Operator commands should be distinct and non-composable by default:

- `prepare`: create and validate one local generation;
- `backup`: upload one exact prepared generation and emit a receipt;
- `check`: structural or explicitly requested full-data verification;
- `retention-plan`: read-only preview;
- `retention-apply`: require an exact preview digest and repository identity;
- `restore-verify`: restore one exact snapshot to an absent isolated path;
- `activate`: intentionally excluded from this implementation plan.

Every mutating command takes an exact generation/snapshot/repository identity. No command accepts
an unrestricted source path, wildcard, implicit latest snapshot for restore, or remove-all policy.

## 8. Evidence and stop conditions

Store only secret-free test reports and receipts. Evidence must distinguish local emulator results,
disposable R2 results, VPS rehearsal, and live backup freshness.

Stop before the next stage when:

- source consistency or tenant reconciliation is ambiguous;
- restic output/exit semantics differ from the pinned contract;
- a secret or user value reaches arguments, logs, receipts, or fixtures;
- cleanup target identity is not exact;
- retention preview is empty, removes all recovery points, or conflicts with Bucket Lock;
- the repository format or pinned binary cannot be independently recovered;
- external account, credential, VPS, network, or live-data access would be required without a
  separate authorization.

## 9. Next decisions

After this plan is accepted, the next safe implementation is Slice A plus L0 tests. Later gates
remain separate:

1. approve the implementation plan;
2. implement and review L0/L1 locally;
3. authorize and execute R2D with synthetic data;
4. accept the exact restic version, R2 bucket profile, credential scopes, and recovery custody;
5. authorize VPS installation and synthetic rehearsal;
6. authorize the first encrypted live backup;
7. accept an isolated restore rehearsal before claiming backup capability in the Privacy Notice.
