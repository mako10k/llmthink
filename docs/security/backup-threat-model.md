# llmthink backup threat model

- Status: draft for owner review
- Date: 2026-08-21
- Scope: hosted trial backup and restore requirements before infrastructure selection

## 1. Purpose and sequencing

This document defines what the backup system must protect and what failures it must survive
without assuming a provider, protocol, storage product, region, or key-management service.

The decision sequence is deliberately separated:

1. accept this infrastructure-independent threat model, priority policy, and target objectives;
2. construct one or more hypothetical infrastructure profiles that claim to satisfy it;
3. map each requirement to what each profile can, cannot, or only partially realize;
4. accept an infrastructure and its explicit residual risks in a later ADR;
5. implement and rehearse backup and restore before terms activation.

Passing a backup creation test is not restore acceptance. Possessing a backup object is not
evidence that it is confidential, complete, authentic, usable, or tenant-safe.

This model is risk-prioritized rather than an assertion that every conceivable threat must be
eliminated. Controls above the minimum safety baseline are pursued on a best-effort basis and
may remain as explicitly recorded residual risk for the unpaid trial.

### Priority policy

| Priority             | Meaning                                                                                                                                                   | Infrastructure decision rule                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| P0 — safety baseline | A backup or restore implementation without this control could itself cause disclosure, tenant mixing, silent corruption, or destruction of the live copy. | Launch blocker. Reject or redesign the infrastructure; do not waive merely for convenience.                           |
| P1 — trial target    | Materially improves recoverability or resistance to realistic compromise, but may be bounded by cost and single-operator capacity.                        | Best effort. Prefer support; otherwise document the gap, compensating operation, and review trigger.                  |
| P2 — improvement     | Defense in depth against lower-probability, correlated, or sophisticated failure.                                                                         | Do not block the initial unpaid trial. Keep a visible backlog and reconsider as usage, sensitivity, or revenue grows. |

“Best effort” means an explicit attempt, evidence of the achieved level, and disclosure of the
remaining risk. It does not mean treating an unknown or failed control as satisfied.

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

## 5. Service-loss scenarios

Technical controls are subordinate to the service-loss scenarios that make a backup necessary.

| ID     | Priority | Service-loss scenario                                                  | Recovery outcome sought                                                                          |
| ------ | -------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| BSL-01 | P0       | ConoHa VPS, account, or control plane is lost or unavailable long term | Retrieve an accepted backup without ConoHa access and preserve the option to rebuild elsewhere.  |
| BSL-02 | P0       | Live data is deleted, corrupted, encrypted, or inconsistent            | Return to an earlier verified generation without trusting the damaged live copy.                 |
| BSL-03 | P0       | Backup handling discloses confidential user data                       | Keep off-host artifacts unreadable without separately controlled client-side key material.       |
| BSL-04 | P0       | Restore assigns data to the wrong account or tenant                    | Stop closed on ownership uncertainty; never guess, merge, or automatically reassign ownership.   |
| BSL-05 | P1       | ConoHa remains unavailable and service must run on another host        | Reconstruct the service manually on replacement infrastructure within the target RTO.            |
| BSL-06 | P1       | Operator device, credential, or working environment is lost            | Recover keys, procedures, and accepted generations without relying on the lost device.           |
| BSL-07 | P1       | Cost, capacity growth, or job failure stops useful backup              | Detect stale recovery points and adapt retention or budget before all usable generations expire. |
| BSL-08 | P1       | Operator is temporarily unavailable                                    | Preserve enough secret-safe procedure and status evidence to avoid unsafe improvisation later.   |
| BSL-09 | P2       | Primary hosting and the selected backup provider fail together         | Add another provider-independent or controlled offline generation as usage and sensitivity grow. |
| BSL-10 | P2       | Prolonged operator absence prevents recovery                           | Consider a separately authorized recovery custodian and succession procedure.                    |

For the initial trial, “ConoHa-independent” means accepted backup bytes remain retrievable when
the ConoHa server, account, API, snapshot, and support channel are all unavailable. It does not
require automatic failover or immediate service continuity.

## 6. Threat actors and failure sources

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

## 7. Prioritized technical threats and control outcomes

| ID     | Priority | Threat                                                     | Target result, independent of implementation                                                                                                                                                                |
| ------ | -------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BTH-01 | P0       | Network interception or endpoint confusion during transfer | Only an authenticated destination receives an already encrypted artifact; a transport security failure stops the transfer.                                                                                  |
| BTH-02 | P0       | Backup-storage read compromise                             | Storage disclosure reveals no usable thought content, identity mapping, recovery verifier, or secret without separately held key material.                                                                  |
| BTH-03 | P1       | Live host compromise reads backup credentials or keys      | Compromise of the continuously running service alone should not grant both unrestricted historical read access and irreversible deletion of every backup generation.                                        |
| BTH-04 | P1       | Backup account compromise deletes or replaces generations  | Retention/version protection and separated authority should preserve at least one verified generation; replacement is detected cryptographically.                                                           |
| BTH-05 | P1       | Operator workstation compromise                            | Long-lived key and deletion-authority exposure is minimized; rotation and revocation have a documented path and create no plaintext backup copy.                                                            |
| BTH-06 | P0       | Inconsistent SQLite copy                                   | Snapshot includes a SQLite-supported consistent state, not a main-file-only copy that omits committed WAL data.                                                                                             |
| BTH-07 | P0       | Control-plane and thought-data skew                        | Every generation records a recovery-point relationship; restore reconciles ownership and fails closed on missing, orphaned, or conflicting data.                                                            |
| BTH-08 | P0       | Cross-tenant disclosure during restore                     | Restore targets an isolated absent destination and preserves server-derived tenant/workspace boundaries; no path or owner is inferred from user input.                                                      |
| BTH-09 | P0       | Silent corruption or substitution                          | Authenticated encryption plus a checked manifest detects modification, truncation, wrong generation, and wrong source before activation.                                                                    |
| BTH-10 | P1       | Ransomware or destructive automation                       | Backup failure domains and deletion authority should be sufficiently separate that one compromised automation path cannot erase all accepted recovery points.                                               |
| BTH-11 | P0       | Primary hosting outage, account loss, or termination       | At least one accepted encrypted generation is retrievable without the ConoHa server, account, API, snapshot, or control plane.                                                                              |
| BTH-12 | P1       | Key loss                                                   | Controlled key recovery should survive loss of one operator device and be rehearsed without exposing the key in evidence.                                                                                   |
| BTH-13 | P1       | Excessive retention after user/account deletion            | Expiration and exceptional legal holds are bounded and recorded; expiry is not silently reset by copying.                                                                                                   |
| BTH-14 | P0       | Backup/log metadata leaks identities or content            | Receipts and normal logs contain only safe artifact IDs, time, size, schema/generation, result, and digest; no content, token, raw external subject, recovery secret, key, or unnecessary identifying path. |
| BTH-15 | P0       | Unverified restore is activated                            | Restore validation and activation are distinct owner-gated steps; ambiguity, invariant failure, or incomplete evidence stops activation.                                                                    |
| BTH-16 | P2       | Backup tooling supply-chain compromise                     | Tool/version verification and least privilege are increased over time; source expansion and secret export remain prohibited.                                                                                |
| BTH-17 | P1       | Backup job repeatedly fails unnoticed                      | Freshness monitoring should report missed recovery points without exposing payload data; stale state is never reported as success.                                                                          |
| BTH-18 | P0       | Restore destroys the only live copy                        | Restore never initially overwrites the live path and retains a rollback boundary until post-activation checks succeed.                                                                                      |
| BTH-19 | P2       | Primary hosting and backup provider fail together          | A second provider-independent or controlled offline generation is considered as usage, sensitivity, or revenue grows.                                                                                       |

Priority is initially assigned by consequence and feasibility, not numerical risk scoring. The
infrastructure comparison may propose priority changes, but cannot silently apply them.

## 8. Minimum safety baseline and best-effort controls

The following are the proposed P0 minimum safety baseline:

1. Payload encryption is applied before data crosses from the controlled snapshot or
   cryptographic boundary into backup storage. Transport encryption alone is insufficient.
2. Encryption provides authenticity, not confidentiality alone. Modified artifacts never
   reach activation.
3. The backup-storage provider does not receive plaintext backup keys as part of ordinary
   storage access.
4. Lifecycle control-plane and thought-data backups remain logically distinct artifacts but
   share an explicit recovery-point manifest.
5. Tenant isolation remains fail closed during restore and reconciliation. Missing ownership
   data never causes a tenant to be guessed, merged, or reassigned.
6. Restore is performed to a new isolated destination, verified, and only then activated by
   an explicit operator action.
7. Backup and restore evidence is secret-free and does not contain user content.
8. Backup retention is not a substitute for user archive. User-visible archive and operator
   disaster recovery remain separate capabilities.
9. A backup is not accepted for trial activation until a representative restore has succeeded under the same
   security boundary intended for operation.
10. At least one accepted encrypted generation is outside ConoHa and remains retrievable without
    any ConoHa account, API, snapshot, or running host.

P1 controls—credential-role separation, deletion resistance, key recovery, freshness
monitoring, and periodic restore rehearsal—are best-effort trial targets. Infrastructure must
show the achieved level and compensating operation. P2 controls, including a second backup
provider or controlled offline copy and stronger supply-chain assurance, enter the improvement
backlog and do not block the initial unpaid trial.

Infrastructure unable to satisfy P0 is rejected. A P1/P2 gap is acceptable only when visible in
the comparison and final ADR; it does not require pretending that the control exists.

## 9. Availability and lifecycle objectives for owner acceptance

The following values are proposed targets for an unpaid trial. They are planning targets, not
an SLA, warranty, or claim that the current system meets them:

| Priority | Objective                      | Proposed target                                                                                                          |
| -------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| P1       | Recovery point objective (RPO) | Aim for at most 24 hours of committed data loss after an infrastructure-loss event                                       |
| P1       | Recovery time objective (RTO)  | Aim to decide and complete recovery within 72 hours, excluding events where lawful access or the operator is unavailable |
| P1       | Backup frequency               | Aim for once per 24 hours; require an on-demand verified backup before schema migration or destructive maintenance       |
| P1       | Ordinary retention             | Aim for 30 rolling days and keep the public notice aligned with actual capability                                        |
| P0       | Minimum copy placement         | One live copy plus at least one encrypted generation retrievable independently of ConoHa                                 |
| P0/P1    | Restore rehearsal              | Required before activation; thereafter aim for material-change-triggered and 90-day rehearsal                            |
| P1       | Freshness alert                | Aim to notify the operator if no accepted recovery point exists within 36 hours                                          |
| P1       | Key recovery                   | Aim to survive loss of one ordinary operator device                                                                      |

These objectives do not promise uninterrupted service. If cost or operational constraints make
them unrealistic, change them before infrastructure selection and before publishing matching
terms.

## 10. Backup creation requirements

Unless explicitly deferred by the infrastructure comparison, these are P0 because an unsafe
backup artifact can create a confidentiality or integrity incident. Scheduling, automation, and
additional generation durability are P1 where they do not weaken the P0 artifact itself.

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

## 11. Restore requirements

These are P0 for any restore that may be activated. A trial may defer performing a restore, but
it may not activate an unverified or tenant-unsafe restore.

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

## 12. Deletion and incident requirements

These are P1 operational targets except where applicable law, the public notice, or incident
containment imposes a stronger obligation. The infrastructure comparison must identify which
parts are automated and which depend on a manual operator procedure.

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

## 13. Prioritized evidence

Before trial activation, P0 evidence is required for:

- exact source inventory and exclusion behavior;
- retrieval of an accepted generation with no ConoHa service or credential dependency;
- consistent SQLite backup under active WAL writes;
- control-plane/thought-data recovery-point and reconciliation behavior;
- encrypted artifact unreadability without the backup key;
- corruption, truncation, substitution, wrong-generation, and wrong-key rejection;
- restore into an absent location and refusal of archive path escapes;
- cross-tenant, missing-owner, multi-owner, and orphan-data fail-closed behavior;
- full representative restore rehearsal and post-activation rollback check;
- absence of secret-bearing logs and evidence.

P1 evidence is accumulated best effort for storage deletion resistance, credential separation,
key loss/recovery, retention expiry, exceptional holds, and missed-backup detection. Missing P1
evidence is reported as a gap, not converted to a pass. P2 evidence is optional for the initial
trial and retained as improvement evidence when available.

Evidence records may contain requirement IDs, safe artifact IDs, digests, sizes, timestamps,
tool versions, and results. They must not contain content, tokens, raw external subjects,
recovery secrets, encryption keys, provider credentials, or plaintext backup paths that reveal
tenant identity.

## 14. Residual risks that infrastructure cannot remove

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

## 15. Decisions requested from the owner

Before hypothetical infrastructure evaluation, accept or change:

1. the three-tier policy: P0 launch blocker, P1 best-effort trial target, P2 improvement;
2. the P0 assignment for confidentiality, consistency, tenant safety, integrity, isolated
   restore, secret-free evidence, non-destructive activation, and ConoHa-independent retrieval;
3. RPO 24 hours, RTO 72 hours, 30-day retention, 36-hour freshness notification, and 90-day
   rehearsal as P1 targets rather than guarantees;
4. automatic failover and a second backup provider/offline copy as P2, while one
   ConoHa-independent provider remains P0;
5. the rule that a P1/P2 shortfall is recorded as residual risk, while a P0 shortfall rejects
   the infrastructure.

No provider, account, credential, transfer, or Production change is authorized by accepting
this threat model.
