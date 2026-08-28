# `@llmthink/contracts`

This private workspace owns versioned, portable interoperability artifacts. It is not a separate
repository or a published SDK.

The contract set contains:

- the exact Hosted MCP v1 surface pinned by `llmthink-chatgpt-plugin`;
- input, output, error, scope, and effect schemas;
- a SHA-256 manifest with tested producer and consumer provenance;
- a source-independent Conformance Kit for package, producer, and consumer checks;
- shared serializable Hosted API literals and TypeScript command, query, and result types.

The shared Hosted API has an exact type dependency on `@llmthink/core@1.3.0` for `AuditReport`.
It does not own verified request context, repository ports, persistence records, validators, security,
transport adapters, or server runtime implementation.

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

The current `@llmthink/server` workspace owns the live onboarding/delete implementation and
generates the canonical 11-tool producer descriptor. Contracts owns the shared meaning and
Conformance Kit; it does not substitute a descriptor for the live producer.
