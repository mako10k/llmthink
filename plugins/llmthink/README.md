# LLMThink limited trial plugin

This package is the invite-only entry point for the hosted LLMThink MCP trial.
It is not a public Universal Plugin Directory listing.

The Plugin mark reuses the document-structure and blue-arrow motif from the VS Code preview
commands. `assets/llmthink-mark.svg` is the editable source and `assets/icon.png` is the packaged
512 px asset.

## Before installation

- Obtain trial admission and accept the current trial terms through the operator-provided route.
- Authenticate when Codex reports that the hosted MCP server requires OAuth. The Plugin contains
  no bearer token, client secret, or shared operator credential.
- If authentication does not start automatically, run `codex mcp login llmthink` and complete the
  browser flow. Do not copy authorization codes, access tokens, or personal claims into chat,
  screenshots, Git, or shell history.

## Install from a cloned repository

From the repository root:

```bash
codex plugin marketplace add "$(pwd)"
codex plugin add llmthink@llmthink-trial
```

Start a new thread so Codex loads the installed Skills and MCP connection. Select **Authenticate**
for `llmthink` when prompted, or run:

```bash
codex mcp login llmthink
```

Confirm installation without exposing credentials:

```bash
codex plugin list
```

Expected entry: `llmthink@llmthink-trial`, installed and enabled.

## Remove access

```bash
codex plugin remove llmthink@llmthink-trial
codex plugin marketplace remove llmthink-trial
codex mcp logout llmthink
```

Removal from Codex does not revoke the provider-side session or account. Ask the operator to
suspend trial access when server-side revocation is also required.

## Trial boundaries

- Installation does not authorize access to another tenant or workspace.
- The server remains authoritative for identity, scope, tenant, workspace, revision, and write
  confirmation checks.
- Availability, retained data, terms, limits, and future pricing may change; continued service is
  not guaranteed.
- Universal Plugin Directory submission, general registration, billing, and Production activation
  are outside this package.
