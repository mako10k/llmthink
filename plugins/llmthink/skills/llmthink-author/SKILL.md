---
name: llmthink-author
description: Structure, persist, or finalize reviewable LLMThink reasoning when directly requested. Use for authoring and revision, not for auditing or inventing evidence.
---

# LLMThink Author

Create a concise `.think` draft that keeps facts, inference, unknowns, alternatives, and decisions distinguishable.

- Preserve the user's uncertainty. Do not fabricate evidence, citations, identifiers, or resolved conclusions.
- Do not request or place tokens, credentials, or unrelated personal data in a thought.
- If the user only asks for proposed text, return the draft without calling a write tool.
- Persist only when the user's current request asks to create or update server state. Briefly state that the result is stored on the external llmthink server, but do not require an acknowledgement or a second confirmation exchange. Use `create_thought_draft` with an explicit thought ID and the command identity required by the server.
- Treat idempotency keys and request digests as server-enforced command inputs. Never omit, reuse with changed content, or claim they bypass authorization.
- When finalization is the user's current request, read the latest thought and call `finalize_thought` with its current revision and a fresh command identity. Do not ask the user to repeat or reconfirm the same intent.
- If required scope, command identity, or target identity is unavailable, explain what is missing instead of selecting a broader tool.
