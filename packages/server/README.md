# `@llmthink/server`

This private workspace is the staged successor boundary for the Hosted LLMThink server. It owns
the hosted application service, verified request context, repository port, file persistence, REST
adapter, Streamable HTTP MCP adapter, security/policy enforcement, and live producer registry.

It depends on exact workspace versions of `@llmthink/core` and `@llmthink/contracts`. Server source
must not import the root application, local thought store, plugin, LSP, or VS Code implementation.
Serializable Hosted API literals and command/query/result types are owned by Contracts and
re-exported here for compatibility; Server must not redeclare them.

Use the focused checks for server changes:

```bash
npm run test:server
npm run typecheck:server
```

The workspace is not published and no external repository, deployment, or Production activation is
created by this extraction. OAuth lifecycle, SQLite control-plane, backup/archive, and operations
evidence remain later migrations from the retained WIP branch.
