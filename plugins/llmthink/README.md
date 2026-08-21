# LLMThink limited trial plugin

This package is the invite-only entry point for the hosted LLMThink MCP trial.
It is not a public Universal Plugin Directory listing.

The Plugin mark reuses the document-structure and blue-arrow motif from the VS Code preview
commands. `assets/llmthink-mark.svg` is the editable source and `assets/icon.png` is the packaged
512 px asset.

## Before installation

- Obtain trial admission and accept the current trial terms through the operator-provided route.
- Obtain `LLMTHINK_MCP_TOKEN` through a separate approved secret channel. Do not put it in Git,
  screenshots, chat messages, shell history, or the marketplace manifest.
- The static token is a temporary trial compatibility path. OAuth migration remains a separate
  acceptance gate.

## Install from a cloned repository

From the repository root:

```bash
codex plugin marketplace add "$(pwd)"
codex plugin add llmthink@llmthink-trial
```

Export `LLMTHINK_MCP_TOKEN` only in the environment that starts Codex, then start a new thread so
Codex loads the installed Skills and MCP connection.

Confirm installation without exposing credentials:

```bash
codex plugin list
```

Expected entry: `llmthink@llmthink-trial`, installed and enabled.

## Remove access

```bash
codex plugin remove llmthink@llmthink-trial
codex plugin marketplace remove llmthink-trial
unset LLMTHINK_MCP_TOKEN
```

Removal from Codex does not revoke the server credential. Ask the operator to revoke the trial
credential separately.

## Trial boundaries

- Installation does not authorize access to another tenant or workspace.
- The server remains authoritative for identity, scope, tenant, workspace, revision, and write
  confirmation checks.
- Availability, retained data, terms, limits, and future pricing may change; continued service is
  not guaranteed.
- Universal Plugin Directory submission, general registration, billing, and Production activation
  are outside this package.
