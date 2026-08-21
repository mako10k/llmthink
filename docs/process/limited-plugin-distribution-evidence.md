# Limited Plugin distribution acceptance evidence

Date: 2026-08-21

Status: accepted for continuing operator-only testing through the limited repository marketplace.
OAuth migration and admission of another person remain separate gates.

## Accepted distribution boundary

- Entry: local or cloned-repository marketplace for named trial users.
- Package: `plugins/llmthink` containing the manifest, three Skills, and hosted MCP connection.
- Authentication today: operator-issued `LLMTHINK_MCP_TOKEN` environment variable.
- Admission today is operationally invite-only: the operator controls Plugin instructions and
  token delivery. It is not yet a cryptographic invitation gate. The MCP URL is public, and a
  bearer token holder can act as the account mapped to that token until it is rotated or revoked.
- Not included: Universal Plugin Directory submission, public listing assets, general discovery,
  general registration, billing, release, or Production activation.

## Evidence collected

- The plugin-creator validator accepted `plugins/llmthink`.
- A personal marketplace and the distributable `llmthink-trial` repository marketplace were
  generated through the plugin-creator workflow.
- `codex plugin add llmthink@personal --json` installed and enabled the repository-backed plugin.
- `codex plugin add llmthink@llmthink-trial --json` installed the repository marketplace entry.
- The VS Code preview command's document-structure and blue-arrow motif was adapted into a
  theme-independent 512 px Plugin mark, bound as both `composerIcon` and `logo` in version
  `1.2.0+codex.20260821100909`.
- `https://llmthink.mk10.org/.well-known/oauth-protected-resource` returned HTTP 200 and advertised
  the expected MCP resource, AuthKit authorization server, and bounded thought/audit scopes.
- No credential value was printed or written to the repository or marketplace manifest.
- A fresh ephemeral Codex process loaded `llmthink-auditor` from repository Plugin version
  `1.2.0+codex.20260821100909`, invoked only hosted MCP tool `audit_thought`, and returned
  `persisted: false`. The supplied plain sentence intentionally produced one DSL contract fatal;
  this proves the Skill and remote audit path loaded without claiming a semantic pass.
- The owner disabled AuthKit sign-up for the `llmthink` Staging environment. A fresh headless
  browser readback rendered only sign-in controls and the configured identity-provider links, with
  no sign-up link. The llmthink protected-resource discovery endpoint remained HTTP 200 and still
  advertised the same Staging AuthKit authorization server and bounded scopes.
- A fresh Codex process loaded `llmthink-author` and called `create_thought_draft` exactly once for
  `synthetic-plugin-acceptance-20260821-01`. Readback identified only
  `deployment-tenant/deployment-workspace`, revision 1, status `draft`.
- A separate fresh process loaded `llmthink-reflector`, read revision 1 exactly once, and called
  `add_thought_reflection` exactly once with the frozen note and command identity. Independent
  readback returned revision 2, two history entries, one reflection, and exact text equality.
- Four dedicated local negative fixtures passed: compound reference rejection across tenant or
  workspace, traversal and cross-tenant rejection without touching the other tenant, workspace-
  bounded list/search, and inability of Skills to alter authorization or revision outcomes.
- At that acceptance checkpoint, the synthetic thought remained available because the public
  Plugin surface had no deletion tool. This is historical evidence, not a statement of the current
  surface.

## Separately gated follow-up

1. Complete the separate OAuth Stage interoperability path before removing
   `bearer_token_env_var` from the distributable plugin.
2. Before admitting another person, replace the continuing operator-test credential with a
   dedicated per-user credential or accepted OAuth identity. Test revocation on a disposable
   credential rather than disabling the operator's continuing test path.

## OAuth participant candidate prepared

The repository source now contains a participant OAuth candidate, locally installed at Plugin
version `1.2.0+codex.20260821115249`. Its MCP configuration explicitly selects `auth: oauth` and contains
neither `bearer_token_env_var` nor `LLMTHINK_MCP_TOKEN`. The README uses the client-managed
`codex mcp login llmthink` and logout flow and does not instruct a participant to receive a shared
secret.

That candidate was later installed locally as version `1.2.0+codex.20260821115249`, authenticated
through WorkOS OAuth, and read back from a fresh Codex process. The earlier static-token operator
installation is no longer the current local installation.

Read-only public evidence collected at 2026-08-21T19:44+09:00:

- protected-resource metadata returned HTTP 200 for exact resource
  `https://llmthink.mk10.org/mcp` and advertised the bounded thought/audit scopes;
- an unauthenticated MCP request returned HTTP 401 with the exact RFC 9728
  `resource_metadata` challenge;
- the advertised AuthKit authorization server returned HTTP 200 metadata with Authorization Code,
  refresh token, PKCE S256, public-client token authentication (`none`), CIMD, and DCR support;
- Plugin validation passed, the complete local suite passed 220 tests with one intentional real-
  restic skip, and focused OAuth/plugin tests passed;
- no OAuth login, client registration, account mapping, invitation, deployment, or publication was
  performed.

Later on 2026-08-21, a separated client completed OAuth login, explicit onboarding, exact account
and tenant/workspace provisioning, authenticated MCP help/audit/list calls, and unauthenticated HTTP
401 readback. Revision `df8e6830dd985a3786c77bc1f1f99922e5144947` then added tenant-bound,
revision-checked, idempotent physical deletion. A bounded synthetic create/read/delete rehearsal
returned a deletion receipt, subsequent `get_thought` returned `not_found`, and filesystem readback
found no synthetic directory or temporary deletion directory. One digest-only deletion receipt was
retained for bounded idempotency evidence.

External-participant refresh and revocation evidence remains separate. No other person was invited,
and general registration, Production, publication, and billing remain disabled or unauthorized.

This acceptance authorizes continuing operator testing only. It does not authorize inviting a
third party, general registration, Production activation, publication, or billing.
