# restic 0.19.1 verification and installation runbook

This runbook prepares evidence for the separately gated VPS installation. Running these commands
changes the selected host and therefore requires explicit VPS-install authorization. It does not
create or access R2 resources, place backup credentials, enable a timer, or read live data.

## Preconditions

- ADR-0014 remains accepted and restic 0.19.1 has no unresolved applicable security advisory.
- The target is Linux amd64 and `/opt/llmthink/bin/restic-0.19.1` is absent.
- `gpgv`, `gpg`, `bzip2`, HTTPS CA roots, Node.js, and the reviewed llmthink build are present.
- Work in a newly created root-owned directory. Do not reuse downloads from an earlier attempt.
- Obtain the restic signing public key through the official installation documentation and verify
  its complete fingerprint before exporting a dedicated keyring:

  `CF8F 18F2 8445 7597 3F79 D4E1 91A6 868B D3F7 A907`

The canonical fingerprint required by the verifier is
`CF8F18F2844575973F79D4E191A6868BD3F7A907`.

## Prepare and verify

Freeze an explicit working directory and download only the exact release artifacts:

```sh
install -d -o root -g root -m 0700 /var/lib/llmthink-restic-install/0.19.1
cd /var/lib/llmthink-restic-install/0.19.1
curl --fail --location --proto '=https' --tlsv1.2 --remote-name \
  https://github.com/restic/restic/releases/download/v0.19.1/restic_0.19.1_linux_amd64.bz2
curl --fail --location --proto '=https' --tlsv1.2 --remote-name \
  https://github.com/restic/restic/releases/download/v0.19.1/SHA256SUMS
curl --fail --location --proto '=https' --tlsv1.2 --remote-name \
  https://github.com/restic/restic/releases/download/v0.19.1/SHA256SUMS.asc
```

After independently verifying the imported key's complete fingerprint, export only that key to
`/var/lib/llmthink-restic-install/restic-signing.gpg`. Then run the repository verifier from the
reviewed exact llmthink build:

```sh
node /opt/llmthink/current/node_modules/llmthink/dist/server/backup/restic-supply-cli.js \
  --asset /var/lib/llmthink-restic-install/0.19.1/restic_0.19.1_linux_amd64.bz2 \
  --checksums /var/lib/llmthink-restic-install/0.19.1/SHA256SUMS \
  --signature /var/lib/llmthink-restic-install/0.19.1/SHA256SUMS.asc \
  --keyring /var/lib/llmthink-restic-install/restic-signing.gpg \
  --output-binary /var/lib/llmthink-restic-install/0.19.1/restic-0.19.1.verified \
  --output-receipt /var/lib/llmthink-restic-install/0.19.1/supply-receipt.json \
  --verifier operator-1
```

Any non-zero exit stops installation. Do not retry into the same output paths; preserve only
secret-free diagnostics, investigate, and create a fresh working directory.

## Install, read back, and stop

Only after reviewing the receipt, install without a mutable symlink and compare the installed
digest to the receipt:

```sh
install -d -o root -g root -m 0755 /opt/llmthink/bin
install -o root -g root -m 0755 \
  /var/lib/llmthink-restic-install/0.19.1/restic-0.19.1.verified \
  /opt/llmthink/bin/restic-0.19.1
/opt/llmthink/bin/restic-0.19.1 version
sha256sum /opt/llmthink/bin/restic-0.19.1
```

Stop here. Installation does not authorize repository initialization, secret placement, R2 access,
systemd units, backup, retention, restore, or activation. Keep the receipt outside public web roots
and logs. The receipt is non-secret but remains operational evidence.

## Rollback

Before the first repository operation, rollback is removal of the exact newly installed versioned
file after checking that no process or unit references it. After any repository operation, do not
remove or replace it merely because a newer version exists; follow ADR-0014 compatibility and
rollback gates.
