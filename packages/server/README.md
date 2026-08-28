# `@llmthink/server`

This private, service-only workspace is the successor boundary for the Hosted LLMThink server. It owns
the hosted application service, repository contract, file persistence, REST adapter, Streamable
HTTP MCP adapter, and server enforcement.

It depends on exact workspace versions of `@llmthink/core` and `@llmthink/contracts`. Server source
must not import the root application, local thought store, plugin, LSP, or VS Code implementation.
The public root `llmthink` package does not depend on, bundle, or re-export this workspace.

Use the focused checks for server changes:

```bash
npm run test:server
npm run typecheck:server
```

The workspace is not an npm distribution target. It remains independently buildable for service
development until an external repository and service release owner are separately approved. No
external repository, deployment, or Production activation is created by this extraction. OAuth
lifecycle, SQLite control-plane, backup/archive, and operations evidence remain later migrations
from the retained WIP branch.
