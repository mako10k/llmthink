# Limited Plugin distribution acceptance evidence

Date: 2026-08-21

Status: prepared locally; final acceptance blocked on a fresh-thread client exercise and OAuth
migration decision.

## Accepted distribution boundary

- Entry: local or cloned-repository marketplace for named trial users.
- Package: `plugins/llmthink` containing the manifest, three Skills, and hosted MCP connection.
- Authentication today: operator-issued `LLMTHINK_MCP_TOKEN` environment variable.
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

## Remaining acceptance checks

1. Start a new Codex thread and confirm the three Skills and hosted MCP connection are loaded.
2. Exercise one read-only audit and one explicitly confirmed write with a dedicated trial account.
3. Confirm another tenant and an unknown workspace fail closed.
4. Complete the separate OAuth Stage interoperability path before removing
   `bearer_token_env_var` from the distributable plugin.
5. Revoke the dedicated trial credential and confirm subsequent use fails closed.

Until these checks pass, `ACCEPT_LIMITED_PLUGIN_DISTRIBUTION` must not be marked done and no trial
user may be admitted on the strength of this evidence alone.
