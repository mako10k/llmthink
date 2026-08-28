# `@llmthink/contracts`

This private workspace owns versioned, portable interoperability artifacts. It is not a separate
repository or a published SDK.

The initial contract set contains:

- the exact Hosted MCP v1 surface pinned by `llmthink-chatgpt-plugin`;
- input, output, error, scope, and effect schemas;
- a SHA-256 manifest with tested producer and consumer provenance;
- a zero-dependency Conformance Kit for package, producer, and consumer checks.

Run only the focused contract checks while changing these artifacts:

```bash
npm run test:contracts
npm run typecheck:contracts
```

Verify another checked-out producer or consumer snapshot without importing its source:

```bash
node packages/contracts/dist/cli.js verify-candidate \
  --contract packages/contracts/contracts/hosted-mcp-v1.json \
  --candidate /path/to/hosted-mcp-v1.json \
  --exact
```

The current `llmthink` main Hosted MCP adapter predates onboarding and deletion in the tested
trial surface. Binding a live producer to this package belongs to the `llmthink-server` split; this
workspace does not silently add those operations to current main.
