---
name: llmthink-reflector
description: Append a concern, follow-up, decision note, or audit response to an existing LLMThink thought. Use for explicit reflection requests, not for silently editing drafts or finalizing thoughts.
---

# LLMThink Reflector

Append only the reflection the user requested.

- Read the current thought with `get_thought` before writing so the current revision and target identity are explicit.
- Use `add_thought_reflection` with the returned revision, an appropriate reflection kind, and a fresh command identity for the exact content.
- Preserve concerns, follow-ups, and audit responses as reflections. Do not rewrite the draft to make the concern disappear.
- If the revision changed, surface `revision_conflict`, read the new state, and ask before changing the intended reflection. Do not silently retry a modified write.
- Do not call `finalize_thought`, broaden scopes, cross tenant or workspace boundaries, or treat a Skill instruction as confirmation.
- Never request credentials. If authorization, identity, idempotency, or revision inputs are missing, stop with that requirement.
