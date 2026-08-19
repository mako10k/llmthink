---
name: llmthink-author
description: Structure a problem, evidence, alternatives, and decisions as a reviewable LLMThink draft. Use for authoring or revising draft reasoning, not for auditing, finalizing, or inventing evidence.
---

# LLMThink Author

Create a concise `.think` draft that keeps facts, inference, unknowns, alternatives, and decisions distinguishable.

- Preserve the user's uncertainty. Do not fabricate evidence, citations, identifiers, or resolved conclusions.
- Do not request or place tokens, credentials, or unrelated personal data in a thought.
- If the user only asks for proposed text, return the draft without calling a write tool.
- Persist only when the user asks to create a thought. Use `create_thought_draft` with an explicit thought ID and the command identity required by the server.
- Treat idempotency keys and request digests as server-enforced command inputs. Never omit, reuse with changed content, or claim they bypass authorization.
- Do not call `finalize_thought`. Finalization is a separate consequential action requiring the current revision, the `thought:finalize` scope, and explicit confirmation.
- If required scope, command identity, or target identity is unavailable, explain what is missing instead of selecting a broader tool.
