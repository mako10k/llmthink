# llmthink backup threat model

- Status: draft for owner review
- Date: 2026-08-21
- Scope: hosted trial backup and restore requirements before infrastructure selection

## 1. Purpose and sequencing

This document defines what the backup system must protect and what failures it must survive
without assuming a provider, protocol, storage product, region, or key-management service.

The decision sequence is deliberately separated:

1. accept this infrastructure-independent threat model and its service objectives;
2. construct one or more hypothetical infrastructure profiles that claim to satisfy it;
3. map each requirement to what each profile can, cannot, or only partially realize;
4. accept an infrastructure and its explicit residual risks in a later ADR;
5. implement and rehearse backup and restore before terms activation.

Passing a backup creation test is not restore acceptance. Possessing a backup object is not
evidence that it is confidential, complete, authentic, usable, or tenant-safe.

## 2. System scope

### Included

- lifecycle control-plane SQLite database, including its committed WAL state;
- tenant/workspace thought data and immutable revisions under the hosted data root;
- the minimum metadata needed to relate a backup generation to schema, data generation,
  retention, integrity, and restore evidence;
- encryption, authentication, signing, deletion, and restore credentials used only for the
  backup lifecycle;
- backup creation, transfer, storage, retention, deletion, restore, and reconciliation;
- operator procedures and audit evidence for all of the above.

### Excluded from the backup payload

- WorkOS passwords, authorization codes, access tokens, or refresh tokens;
- plaintext recovery credentials;
- deployment bearer tokens, provider API credentials, private encryption keys, or key
  recovery material;
- general application logs not required for a specific recovery purpose;
- unrelated host files, home directories, package caches, and temporary files.

Configuration necessary to rebuild the service may need a separate, secret-aware recovery
package. It must not be silently mixed into user-data backups.

## 3. Assets and impact classes

| Asset                                                       | Confidentiality impact                                               | Integrity impact                                      | Availability impact                               |
| ----------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------- |
| Thought content, audits, reflections, events                | Critical: may contain personal, confidential, or privileged material | Critical: altered reasoning history can mislead users | High: loss defeats archive and recovery           |
| Tenant/workspace ownership and account mapping              | High: enables identity correlation                                   | Critical: corruption can cross tenant boundaries      | Critical: required for safe authorization         |
| Agreement receipts and terms digests                        | Medium                                                               | High: affects proof of consent                        | Medium                                            |
| Recovery verifiers and security audit records               | High                                                                 | Critical: alteration can enable account takeover      | High                                              |
| Backup manifests, generation IDs, digests, restore receipts | Low to medium if pseudonymous                                        | Critical: substitution defeats verification           | High                                              |
| Backup encryption/authentication keys                       | Critical                                                             | Critical                                              | Critical: loss can make every generation unusable |
| Backup deletion or retention authority                      | High                                                                 | Critical                                              | Critical: misuse can erase all recoverable copies |

All backup payloads inherit the highest confidentiality classification of the included data.
Pseudonymous tenant IDs reduce incidental disclosure but are not treated as anonymization.

## 4. Abstract trust boundaries

The following boundaries exist regardless of the chosen infrastructure:

1. **Live service boundary** — the process and storage that hold current data.
2. **Snapshot boundary** — the component that obtains a consistent control-plane and data-plane
   recovery point.
3. **Cryptographic boundary** — where plaintext becomes an authenticated encrypted artifact
   and where restore plaintext may reappear.
4. **Transfer boundary** — every network or removable-media hop carrying an artifact.
5. **Backup storage boundary** — infrastructure retaining encrypted generations.
6. **Control boundary** — identities allowed to create, list, retain, delete, or restore
   generations.
7. **Key-custody boundary** — storage and recovery of encryption/authentication keys.
8. **Restore boundary** — isolated destination used to verify a generation before activation.
9. **Operator boundary** — workstation, session, procedure, and evidence used by the operator.

Infrastructure evaluation must state which concrete component occupies each boundary. A single
component may occupy more than one boundary, but every resulting correlated-failure risk must
be explicit.

## 5. Threat actors and failure sources

- unauthenticated external attacker;
- malicious or compromised tenant attempting path or identifier manipulation;
- attacker with a compromised live-service process or VPS account;
- attacker with backup-storage read access;
- attacker with backup-storage deletion or overwrite authority;
- compromised operator workstation, session, or credential;
- malicious or compelled infrastructure provider or provider administrator;
- vulnerable or malicious backup client, dependency, or update;
- operator error, including selecting the wrong source, destination, generation, or tenant;
- software defect, crash, partial write, filesystem corruption, or SQLite/WAL inconsistency;
- ransomware or destructive automation affecting live and reachable backup storage;
- provider outage, account suspension, service termination, region loss, or commercial failure;
- loss, corruption, or unauthorized disclosure of cryptographic keys;
- legitimate retention or account deletion that is not propagated to backup generations.

The initial service has one human operator. Operator absence and loss of the operator's devices
are therefore availability threats even without hostile action.

## 6. Threats and required controls

| ID     | Threat                                                     | Required result, independent of implementation                                                                                                                                                                           |
| ------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| BTH-01 | Network interception or endpoint confusion during transfer | Only an authenticated destination receives an already encrypted artifact; a transport security failure stops the transfer.                                                                                               |
| BTH-02 | Backup-storage read compromise                             | Storage disclosure reveals no usable thought content, identity mapping, recovery verifier, or secret without separately held key material.                                                                               |
| BTH-03 | Live host compromise reads backup credentials or keys      | Compromise of the continuously running service alone must not grant both unrestricted historical read access and irreversible deletion of every backup generation.                                                       |
| BTH-04 | Backup account compromise deletes or replaces generations  | Retention/version protection and separated authority preserve at least one verified generation; replacement is detected cryptographically.                                                                               |
| BTH-05 | Operator workstation compromise                            | Long-lived key and deletion authority exposure is minimized; rotation and revocation have a documented path and create no plaintext backup copy.                                                                         |
| BTH-06 | Inconsistent SQLite copy                                   | Snapshot includes a SQLite-supported consistent state, not a main-file-only copy that omits committed WAL data.                                                                                                          |
| BTH-07 | Control-plane and thought-data skew                        | Every generation records a recovery-point relationship; restore reconciles ownership and fails closed on missing, orphaned, or conflicting data.                                                                         |
| BTH-08 | Cross-tenant disclosure during restore                     | Restore targets an isolated absent destination and preserves server-derived tenant/workspace boundaries; no path or owner is inferred from user input.                                                                   |
| BTH-09 | Silent corruption or substitution                          | Authenticated encryption plus an independently checked manifest detects modification, truncation, wrong generation, and wrong source before activation.                                                                  |
| BTH-10 | Ransomware or destructive automation                       | Backup failure domains and deletion authority are sufficiently separate from the live writer that one compromised automation path cannot erase all accepted recovery points.                                             |
| BTH-11 | Provider outage or termination                             | Recovery does not depend on one currently reachable provider control plane without an accepted residual-risk exception.                                                                                                  |
| BTH-12 | Key loss                                                   | At least two controlled key-recovery copies or an accepted equivalent survive loss of one operator device; recovery is periodically proven without exposing the key in evidence.                                         |
| BTH-13 | Excessive retention after user/account deletion            | Expiration and exceptional legal holds are bounded, recorded, and applied to backup generations; expiry is not silently reset by copying.                                                                                |
| BTH-14 | Backup/log metadata leaks identities or content            | Receipts and normal logs contain only safe artifact IDs, time, size, schema/generation, result, and cryptographic digest; no content, token, raw external subject, recovery secret, key, or unnecessary filesystem path. |
| BTH-15 | Unverified restore is activated                            | Restore validation and activation are distinct owner-gated steps; ambiguity, invariant failure, or incomplete evidence stops activation.                                                                                 |
| BTH-16 | Backup tooling supply-chain compromise                     | Tool and version are pinned or otherwise verified, run with least privilege, and cannot silently broaden source paths or export secrets.                                                                                 |
| BTH-17 | Backup job repeatedly fails unnoticed                      | Bounded freshness monitoring reports missed recovery points without exposing payload data; stale status cannot be interpreted as success.                                                                                |
| BTH-18 | Restore destroys the only live copy                        | Restore never initially overwrites the live path and retains a rollback boundary until post-activation checks succeed.                                                                                                   |

## 7. Non-negotiable security invariants

The following are proposed hard requirements for infrastructure evaluation:

1. Payload encryption is applied before data crosses from the controlled snapshot or
   cryptographic boundary into backup storage. Transport encryption alone is insufficient.
2. Encryption provides authenticity, not confidentiality alone. Modified artifacts never
   reach activation.
3. The backup-storage provider does not receive plaintext backup keys as part of ordinary
   storage access.
4. One continuously available credential does not provide live-data write, backup plaintext
   read, and destruction of all retained generations.
5. Lifecycle control-plane and thought-data backups remain logically distinct artifacts but
   share an explicit recovery-point manifest.
6. Tenant isolation remains fail closed during restore and reconciliation. Missing ownership
   data never causes a tenant to be guessed, merged, or reassigned.
7. Restore is performed to a new isolated destination, verified, and only then activated by
   an explicit operator action.
8. Backup and restore evidence is secret-free and does not contain user content.
9. Backup retention is not a substitute for user archive. User-visible archive and operator
   disaster recovery remain separate capabilities.
10. A backup is not accepted until a representative restore has succeeded under the same
    security boundary intended for operation.

Any infrastructure unable to satisfy an invariant is rejected unless the owner explicitly
changes this threat model and accepts the identified residual risk first.

## 8. Availability and lifecycle objectives for owner acceptance

The following values are proposed for an unpaid trial. They are service requirements, not
claims that the current system meets them:

| Objective                      | Proposed requirement                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Recovery point objective (RPO) | At most 24 hours of committed data loss after an infrastructure-loss event                                                    |
| Recovery time objective (RTO)  | Restore decision and service recovery within 72 hours, excluding events where lawful access or the operator is unavailable    |
| Backup frequency               | At least once per 24 hours, plus an on-demand verified backup before schema migration or destructive maintenance              |
| Ordinary retention             | 30 rolling days                                                                                                               |
| Minimum failure domains        | One live copy plus at least one encrypted off-host backup generation                                                          |
| Restore rehearsal              | Before activation, after material format/key/infrastructure change, and at least once every 90 days while the trial is active |
| Freshness alert                | Operator-visible failure if no accepted recovery point exists within 36 hours                                                 |
| Key recovery                   | Loss of one ordinary operator device must not make all retained generations permanently unreadable                            |

These objectives do not promise uninterrupted service. If cost or operational constraints make
them unrealistic, change them before infrastructure selection and before publishing matching
terms.

## 9. Backup creation requirements

- Enumerate source roots explicitly; do not recursively back up the host, home directory, or
  unresolved environment-variable path.
- Refuse symlinks, unexpected mounts, sockets, devices, and files outside the allowed source
  roots.
- Obtain the SQLite state through its online backup API or another SQLite-supported consistent
  snapshot.
- Establish and record a bounded recovery point between lifecycle and thought-data artifacts.
  The mechanism may use a brief write pause, generation barrier, or later reconciliation, but
  it must not claim atomicity that does not exist.
- Encrypt each generation with authenticated encryption before transfer, using unique nonces
  and a versioned format.
- Create a manifest binding service identity, format version, schema version, generation,
  creation time, component digests, sizes, and retention deadline.
- Upload to a new generation identifier; never overwrite the last accepted generation.
- Verify the remotely retained bytes before issuing a success receipt.
- Treat partial upload, ambiguous response, stale manifest, clock failure, or verification
  failure as failure, without blindly retrying a destructive or finalizing operation.

## 10. Restore requirements

1. Select an immutable generation by exact identifier and expected manifest digest.
2. Retrieve it into a new permission-protected restore area with adequate capacity.
3. Authenticate and decrypt without writing secrets or plaintext to logs or shell history.
4. Validate payload structure, allowlisted paths, sizes, and component digests before extraction.
5. Refuse symlinks, hard-link escapes, absolute paths, `..`, devices, and unexpected files.
6. Run SQLite `integrity_check`, `foreign_key_check`, schema-digest validation, and lifecycle
   invariants.
7. Verify thought revision structure, `CURRENT` targets, immutable revision completeness, and
   absence of tenant/workspace ownership conflicts.
8. Reconcile the lifecycle catalog, realization outbox, and thought data without automatic
   ownership repair.
9. Produce a secret-free restore report and require explicit operator acceptance.
10. Activate atomically, restart, perform bounded read-only checks, and retain a rollback
    boundary until acceptance completes.

## 11. Deletion and incident requirements

- Ordinary expiry deletes generations according to the declared 30-day policy without
  extending retention merely because a generation was copied or re-encrypted.
- A security incident, dispute, or legal hold may isolate a generation longer only with a
  recorded reason, scope, access restriction, and review deadline.
- Account deletion removes live data after the archive period; backup copies expire through the
  declared rotation. Immediate physical deletion from every immutable generation is not
  promised unless the selected infrastructure can prove it.
- Suspected key or storage compromise suspends new backup acceptance, rotates affected
  credentials/keys, preserves evidence without payload disclosure, and triggers a restoreability
  assessment.
- Loss of all readable generations, repeated freshness failure, or an unverified restore is a
  service incident and must not be hidden by reporting only that a job ran.

## 12. Required evidence

Infrastructure and implementation are not accepted without evidence for:

- exact source inventory and exclusion behavior;
- consistent SQLite backup under active WAL writes;
- control-plane/thought-data recovery-point and reconciliation behavior;
- encrypted artifact unreadability without the backup key;
- corruption, truncation, substitution, wrong-generation, and wrong-key rejection;
- storage-read compromise and deletion-authority separation;
- restore into an absent location and refusal of archive path escapes;
- cross-tenant, missing-owner, multi-owner, and orphan-data fail-closed behavior;
- key loss/recovery and credential rotation without secret-bearing logs;
- retention expiry and exceptional-hold auditability;
- missed-backup freshness detection;
- full representative restore rehearsal and post-activation rollback check.

Evidence records may contain requirement IDs, safe artifact IDs, digests, sizes, timestamps,
tool versions, and results. They must not contain content, tokens, raw external subjects,
recovery secrets, encryption keys, provider credentials, or plaintext backup paths that reveal
tenant identity.

## 13. Residual risks that infrastructure cannot remove

- A sufficiently privileged attacker controlling the live process may read data while it is in
  use before backup encryption.
- A malicious operator with legitimate live-data and key access can violate confidentiality;
  procedural separation reduces but cannot eliminate single-operator risk.
- Encryption cannot recover data that was already corrupted before the recovery point unless an
  earlier retained generation remains usable.
- Provider and jurisdictional risks cannot be reduced to zero; infrastructure selection must
  disclose where trust remains.
- Meeting RPO/RTO does not guarantee business continuity, WorkOS availability, network access,
  or compatibility of external MCP clients.

## 14. Decisions requested from the owner

Before hypothetical infrastructure evaluation, accept or change:

1. the hard invariants in section 7;
2. RPO 24 hours and RTO 72 hours;
3. 30-day rolling retention and a 90-day restore-rehearsal interval;
4. the requirement to survive loss of one operator device;
5. the rule that provider/storage access alone must not decrypt backup payloads;
6. the rule that infrastructure exceptions require explicit residual-risk acceptance rather
   than silently weakening this model.

No provider, account, credential, transfer, or Production change is authorized by accepting
this threat model.
