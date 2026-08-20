# Hosted trial legal artifacts

Status: draft set for owner self-review. No external legal review has been performed.

## Artifact set

- `trial-terms-ja-v1.md`: full trial terms
- `trial-important-summary-ja-v1.md`: pre-agreement important summary
- `trial-privacy-notice-ja-v1.md`: privacy and data-handling notice

## Activation gate

These files are not yet valid agreement artifacts. Before activation:

1. set the effective date and publish `https://llmthink.mk10.org/status`;
2. verify the current WorkOS and hosting-provider privacy, subprocessor, and transfer disclosures;
3. confirm that no external backup provider is active, or disclose it before use;
4. review the liability cap and consumer-facing applicability;
5. render the exact user-facing bytes and verify links and accessibility;
6. compute SHA-256 over exact UTF-8 bytes for the full terms and summary;
7. create immutable SQLite terms artifacts and activate them through an operator-gated action;
8. record owner self-approval, date, exact Git revision, artifact digests, and the fact that no
   external legal review was performed.

Owner self-approval accepts the operational risk of using an internally reviewed draft. It
does not make invalid clauses valid, waive mandatory law, or authorize public enrollment,
billing, or Production activation.

## Public-law references checked for this draft

- Consumer Affairs Agency, Consumer Contract Act overview and Article 8 commentary
- Personal Information Protection Commission, APPI general guidelines including safety
  management measures

The source links and retrieval date should be recorded in the approval receipt rather than
embedded as contractual promises in the public terms.
