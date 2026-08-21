# isolated restore validation evidence

- Status: completed local/disposable evidence
- Date: 2026-08-21
- Scope: Slice D exact restore and pre-activation validation

## Result

Slice D restores one exact restic snapshot into a required absent target and validates the restored
generation without modifying or authorizing the live service. Tests used synthetic local data and
a disposable repository only. No R2, VPS, credential, or live-data operation occurred.

## Implemented boundary

- restic version and full snapshot ID are exact inputs;
- restore uses a shell-free argument vector and an absent isolated target;
- success requires one final JSON summary, zero skipped/deleted files, zero stderr, and exit zero;
- the expected generation path is derived from the exact original absolute path;
- generation root contains exactly `manifest.json`, `lifecycle.sqlite`, and `thought-data`;
- manifest format, generation ID, component sizes, and SHA-256 digests must match;
- SQLite passes schema-version, integrity, foreign-key, and duplicate ownership checks;
- thought hierarchy contains safe tenant/workspace/thought IDs and each `CURRENT` points to a
  matching immutable revision record;
- every restored thought tenant/workspace pair must exist in the restored lifecycle catalog;
- the report contains counts and opaque generation/snapshot IDs only and always states
  `activation_authorized: false`.

The SQLite snapshot is normalized to `journal_mode=DELETE` during backup validation. This prevents
backup-validation WAL/SHM sidecars from silently falling outside the manifest.

## Verified failures

- unknown or altered manifest;
- wrong expected generation;
- component corruption;
- unexpected generation entries;
- self-consistent but uncatalogued tenant/workspace thought hierarchy;
- non-zero restic execution, stderr, malformed restore JSON, existing target, or non-exact
  snapshot configuration through the adapter contract.

## Remaining boundary

This implementation validates recovery candidates only. It contains no live-path replacement,
ownership repair, tenant reassignment, automatic activation, rollback, R2 access, or VPS wiring.
