# restic adapter and local L1 evidence

- Status: completed local/disposable evidence
- Date: 2026-08-21
- Scope: Slice C adapter, fake-process tests, and synthetic local repository only

## Result

The restic process adapter and local L1 workflow passed with synthetic data. No R2 resource,
credential, VPS change, live llmthink data, or persistent restic installation was used.

The disposable binary was restic 0.19.1 for Linux amd64. It was downloaded from the official
GitHub release asset and its SHA-256 digest matched the digest returned by the GitHub release API:

`sha256:f415415624dcc452f2a02b8c33641791a8c6d6d3b65bbb3543fcf9a25151585c`

This is test evidence, not acceptance of 0.19.1 as the operational VPS version. The temporary
binary, repository, password, cache, source, and restore directories were removed after the test.

## Verified behavior

- the adapter invokes an absolute executable directly with `shell: false`;
- repository, password-file, cache, and synthetic S3 credentials are passed through an exact
  environment and secret values do not appear in argv or returned errors;
- the executable version must match the configured exact version;
- unknown exit status, signal, non-empty stderr, unknown JSON message, malformed output, missing
  summary, dry-run summary, and mismatched snapshot reread fail closed;
- a successful backup requires one final summary and an exact filtered snapshot reread matching
  snapshot ID, host, generation tag, stable component tag, and source path;
- repository initialization at format 2, backup, `check --read-data`, exact restore, `forget`,
  `prune`, and empty-repository reread succeeded with synthetic data.

## Compatibility observations

- restic may omit JSON fields whose value is the default; a successful non-dry-run summary omitted
  `dry_run`, so the parser accepts absence as false but still rejects explicit true;
- `snapshots --json <explicit-id>` exits successfully but writes an informational filter warning to
  stderr. The adapter instead rereads by exact host, generation tag, and path, then requires exactly
  one result with the expected full snapshot ID;
- ordinary success with unexpected stderr remains a failure so user paths or warnings are not
  silently accepted or propagated into receipts.

## Remaining gates

- accept the operational restic version and verification procedure;
- implement Slice D isolated restore validation against real generation manifests and tenant
  reconciliation;
- separately authorize disposable R2 testing, VPS installation, credentials, and live backup.
