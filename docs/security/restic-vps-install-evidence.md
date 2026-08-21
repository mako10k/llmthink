# restic 0.19.1 VPS installation evidence

- Status: completed
- Date: 2026-08-21
- Decision: ADR-0014
- Route: approved ProxyJump path through `v1.mk10.org`
- Scope: exact versioned binary installation and readback only

## Result

The target reported Linux `x86_64`, the accepted destination was absent, and the required local
verification tools were available. The official release asset, signed checksum list, and detached
signature were acquired over HTTPS into a disposable local directory. The signing public key was
retrieved over HTTPS and accepted only after its complete fingerprint matched ADR-0014 and the
official restic installation documentation.

The repository supply verifier passed all gates and produced:

- restic version: `0.19.1`
- platform: `linux/amd64`
- signing fingerprint: `CF8F18F2844575973F79D4E191A6868BD3F7A907`
- compressed SHA-256: `f415415624dcc452f2a02b8c33641791a8c6d6d3b65bbb3543fcf9a25151585c`
- expanded binary SHA-256: `20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639`

Only the verified binary and receipt were transferred. They were installed as:

- `/opt/llmthink/bin/restic-0.19.1`: `root:root`, mode `0755`, 30,941,346 bytes
- `/var/lib/llmthink-restic-install/0.19.1/supply-receipt.json`: `root:root`, mode `0600`,
  receipt SHA-256 `8e1c6c1690d4676a5816c6fd929c143fd31a91ec7de12ab425d09d2bc0b341df`

A new independent SSH connection read back the exact version, platform, binary digest, ownership,
mode, and receipt. No mutable `/opt/llmthink/bin/restic` path exists. No llmthink backup systemd
unit exists.

## Cleanup and boundary

The exact VPS staging files and directory were removed after installation. The disposable local
download, public key, keyring, expanded binary, and receipt directory was moved to the local trash
and is recoverable until trash expiry.

No R2 account, bucket, endpoint, credential, repository, password, backup generation, live data,
timer, service unit, retention operation, restore, activation, or application deployment was
created, accessed, or changed. Installation alone is not evidence of backup capability.
