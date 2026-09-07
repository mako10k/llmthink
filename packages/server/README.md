# `@llmthink/server`

This private workspace is the staged successor boundary for the Hosted LLMThink server. It owns
the hosted application service, verified request context, repository port, file persistence, REST
adapter, Streamable HTTP MCP adapter, security/policy enforcement, live producer registry, and the
SQLite lifecycle control plane.

It depends on exact workspace versions of `@llmthink/core` and `@llmthink/contracts`. Server source
must not import the root application, local thought store, plugin, LSP, or VS Code implementation.
Serializable Hosted API literals and command/query/result types are owned by Contracts and
re-exported here for compatibility; Server must not redeclare them.

The lifecycle control plane uses the built-in `node:sqlite` driver on Node.js
`>=24.15.0 <25.0.0`. Writes use `BEGIN IMMEDIATE`, wait for a bounded busy timeout, never perform
blind application retries, and fail closed as `lifecycle_database_busy`. External account identity
is represented by a transport-neutral Server interface; the lifecycle store does not import an
OAuth/JWT implementation. Archive receipts and retention transitions are lifecycle metadata, while
database backup/archive/restore implementation remains a separate migration.

Use the focused checks for server changes:

```bash
npm run test:server
npm run typecheck:server
```

The workspace is not published and no external repository, deployment, or Production activation is
created by this extraction. Managed OAuth, browser onboarding/account registry, database
backup/archive/restore implementation, and operations evidence remain later migrations from the
retained WIP branch.
