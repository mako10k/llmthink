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

The private `@llmthink/server` workspace owns the live producer registry for onboarding plus the
ten admitted tools and verifies it against this package. The public root `llmthink` package does not
import or re-export the producer implementation.
