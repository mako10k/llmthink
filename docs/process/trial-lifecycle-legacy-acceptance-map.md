# Trial lifecycle legacy acceptance evidence map

Date: 2026-08-21

Status: incomplete; no grandfathering

Purpose: map milestones that were already reached before Grammar 7 criterion sets were introduced
to independently identifiable evidence. This map does not itself issue acceptance receipts.

## Evidence map

| Milestone                     | Required outcome                                                                                                    | Evidence                                                                                                                                                                          | Sealgraph state                                              | Result                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `ADR_0011_ACCEPTED`           | provisioning, consent, privacy, recovery, and tenant-boundary decision accepted                                     | `adr/0011`                                                                                                                                                                        | clean sealed                                                 | mappable                                                                                 |
| `LIFECYCLE_DESIGN_READY`      | versioned terms, receipts, states, provisioning, recovery, export, and acceptance contracts defined                 | `docs/specs/trial-account-lifecycle.md` bound by accepted ADR-0011 and the committed revision                                                                                     | committed, not independently named as a seal                 | gap: add a design-baseline seal or bind it to a criterion receipt                        |
| `STORAGE_DECISION_ACCEPTED`   | SQLite control-plane authority, separation, transaction, backup, and recovery boundary accepted                     | `adr/0012`                                                                                                                                                                        | clean sealed                                                 | mappable                                                                                 |
| `TERMS_COPY_APPROVED`         | exact Japanese terms, summary, privacy notice, and owner self-approval fixed                                        | `legal/accepted/trial-terms-ja-v1`, `legal/accepted/trial-important-summary-ja-v1`, `legal/accepted/trial-privacy-notice-ja-v2`, `legal/trial-terms-owner-self-approval-20260821` | clean sealed                                                 | mappable                                                                                 |
| `SQLITE_SCHEMA_READY`         | separated schema, constraints, transaction, migration, and backup profile designed                                  | `design/sqlite-lifecycle-schema`                                                                                                                                                  | clean sealed                                                 | mappable                                                                                 |
| `LIFECYCLE_CORE_IMPLEMENTED`  | exact identity mapping, receipts, state transitions, and concurrency-safe provisioning implemented and tested       | `implementation/sqlite-lifecycle-core`                                                                                                                                            | clean sealed                                                 | mappable                                                                                 |
| `ONBOARDING_IMPLEMENTED`      | explicit consent, nonce, CSRF, stale terms, re-consent, and accessibility behavior implemented and tested           | `implementation/explicit-onboarding-and-reconsent`                                                                                                                                | clean sealed                                                 | mappable                                                                                 |
| `RECOVERY_EXPORT_IMPLEMENTED` | recovery rotation, suspension, export-only, closure, and metadata-only archive evidence implemented and tested      | `implementation/recovery-export-lifecycle`                                                                                                                                        | clean sealed                                                 | mappable                                                                                 |
| `STAGE_LIFECYCLE_ACCEPTED`    | isolated Stage lifecycle matrix and tenant-negative checks accepted                                                 | `acceptance/stage-trial-lifecycle`                                                                                                                                                | clean sealed                                                 | mappable, but does not prove current public deployment                                   |
| `LIMITED_PLUGIN_ACCEPTED`     | operator-only repository Plugin manifest, Skills, hosted MCP behavior, bounded writes, and negative checks accepted | `docs/process/limited-plugin-distribution-evidence.md`                                                                                                                            | modified after the accepted operator evidence; no clean seal | gap: freeze the OAuth-candidate addendum separately from the earlier operator acceptance |

## Receipt policy

- Each milestone needs a revisioned criterion set before a receipt is issued.
- A receipt must reference the exact seal ID or an exact committed artifact digest and revision.
- Task closure, a `status done` field, or this table is not evidence by itself.
- Missing or mixed-scope evidence remains pending. In particular, isolated Stage acceptance cannot
  satisfy deployed-lifecycle acceptance, and the OAuth candidate cannot rewrite the earlier
  operator-only Plugin acceptance.
- No external test, deployment, invitation, publication, or historical work-event rewrite is
  authorized by this map.

## Open reconciliation work

1. Seal or explicitly bind the lifecycle design baseline.
2. Split and freeze the pre-OAuth operator Plugin acceptance from the new OAuth participant
   candidate evidence.
3. Add criterion sets for the ten legacy milestones.
4. Issue receipts only for criteria supported by the clean evidence above, leaving all gaps pending.
