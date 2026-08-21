# legacy off-host restore rehearsal plan

- Status: accepted by owner on 2026-08-21
- Date: 2026-08-21
- Source snapshot: `18c7800bf1020f1e431d00b765f29bfa848aec44367764394fb48424c85df826`
- Scope: isolated read-only recovery proof; no production activation

## Objective

Prove that the accepted legacy snapshot can be recovered without the ConoHa VPS, its host-bound
credential key, or its stored runtime credentials. Use only the owner's off-host Cloudflare account
recovery capability, the password-manager copy of the repository password, public restic supply
artifacts, and the documented repository identity.

The current workstation may execute the rehearsal, but the existing local `secdat` repository
password and every VPS credential are excluded as recovery inputs. The owner attests that the
repository password is re-entered from the password manager into an ephemeral recovery-only entry.

## Owner-provided recovery inputs

1. Create a fresh Cloudflare R2 S3 credential with Object Read Only access restricted to
   `llmthink-backup-3b38f07b`.
2. Enter its endpoint, Access Key ID, and Secret Access Key into recovery-only ephemeral secret
   entries whose names will be provided at execution time.
3. Enter the restic repository password from the password manager into a distinct ephemeral entry.
4. Confirm only completion and the password-manager source; never paste values into chat, argv,
   shell history, Git, evidence, or persistent environment files.

The credential must not grant write/delete, other buckets, account administration, DNS, Workers,
billing, or token creation. Revoke it after the rehearsal and verify revocation.

## Execution

1. Create a new owner-only local temporary root on a filesystem suitable for confidential restored
   content. Stop if its identity, permissions, mount, or cleanup boundary is ambiguous.
2. Download the exact official restic 0.19.1 Linux amd64 release asset, signed checksum list, and
   signature over HTTPS into that root. Verify the full accepted signing fingerprint, signed asset
   digest, expanded binary digest, and exact version using the existing supply verifier.
3. Inject only the four recovery-only ephemeral entries into a bounded restore process. Address the
   existing repository; never run `init`, `backup`, `forget`, `prune`, `unlock`, `repair`, or any
   command that can mutate it.
4. Enumerate and require the exact known snapshot ID, host `llmthink-legacy-v1`, legacy tag, and
   generation tag. Restore only that snapshot into an absent isolated directory.
5. Validate `llmthink-legacy-recovery-generation-v1`, every component digest/count/size, the bounded
   OAuth registry schema, thought repository structure, and absence of symlinks/special files.
6. Record only secret-free IDs, counts, sizes, tool/version evidence, and pass/fail results. Do not
   record restored content, external subject IDs, tenant/workspace/thought IDs, paths containing
   identity, endpoint account identifiers, or secret-derived fingerprints.
7. Remove the exact plaintext restore, cache, downloaded binary/artifacts, and ephemeral entries.
   Confirm the production repository and snapshot are unchanged, then have the owner revoke the
   temporary read-only credential and confirm revocation.

## Stop conditions

- any recovery input comes from the VPS or its encrypted credential files;
- the password-manager source cannot be attested;
- the credential has write/delete or wider account/bucket authority;
- supply verification, exact snapshot identity, full-data check, restore, manifest, component
  digest, registry schema, or thought structure fails;
- an unexpected snapshot/path/tag is selected;
- the local plaintext cleanup target is not exact;
- repository mutation, production replacement, tenant reassignment, or service configuration would
  be required.

## Acceptance boundary

Approval authorizes one read-only restore of the exact snapshot into a disposable local directory,
the temporary read-only R2 credential, recovery-only ephemeral secret entry use, exact plaintext
cleanup, and credential revocation. It does not authorize production restore activation, deletion
or retention changes, a persistent local backup copy, public enrollment, or a claim of automated
backup capability.

The owner accepted this exact boundary on 2026-08-21.
