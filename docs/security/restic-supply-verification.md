# restic operational supply verification evidence

- Status: implemented locally
- Date: 2026-08-21
- Decision: ADR-0014
- Scope: verification tool, unit tests, and non-executed VPS installation runbook

## Result

The local supply verifier implements the accepted restic 0.19.1 Linux amd64 acquisition boundary.
It verifies the exact OpenPGP `VALIDSIG` fingerprint, requires the exact entry in the signed
checksum list, hashes the compressed asset, decompresses only to an absent reserved path, checks
the exact version and platform, and writes one exclusive secret-free receipt containing the
expanded binary digest.

The tool invokes `gpgv`, `bzip2`, and the verified restic binary directly without a shell. Input
artifacts must be absolute regular non-symlink files. Binary and receipt targets must be absent.
Failure removes only the exact reserved binary path and never emits a success receipt.

## Artifacts

- verifier: `src/server/backup/restic-supply.ts`
- CLI: `src/server/backup/restic-supply-cli.ts`
- tests: `test/server/backup-restic-supply.test.ts`
- operator procedure: `deploy/conoha/restic-install-runbook.md`

## Verification

- valid synthetic process results produce a strict path-free receipt only after all gates;
- the official compressed digest is pinned and compared independently of the signed-list parser;
- a wrong signing fingerprint stops before checksum use or decompression;
- formatting, lint, TypeScript typecheck, focused tests, complete tests, and build are required
  before sealing this evidence.

## Boundary

No official artifact was retained, no signing key was imported, and no VPS, R2, credential, live
data, systemd unit, repository, or timer was accessed or changed. The runbook explicitly stops
after versioned binary installation and readback. Running it remains separately authorized.
