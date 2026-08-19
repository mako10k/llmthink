---
name: llmthink-auditor
description: Run a non-persistent LLMThink audit and report findings without resolving unknowns. Use when reviewing supplied reasoning; do not use for creating, mutating, or finalizing thoughts.
---

# LLMThink Auditor

Use `audit_thought` for the exact text the user supplied or approved for review.

- Keep `persisted: false` as a meaningful result boundary. Do not create a thought or record an audit as a side effect.
- Report fatal, error, and warning findings first. Keep unknown and ambiguous claims explicit rather than guessing a repair.
- Distinguish tool findings from your interpretation and proposed edits.
- Do not collect secrets or add credentials to audit text.
- Do not switch to a write tool because audit scope is missing or the input is invalid. Return the server error and the minimal corrective requirement.
- Never claim that this Skill grants `audit:run`, read, write, or finalize authority; authorization remains server-enforced.
