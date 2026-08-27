# `@llmthink/core`

This workspace owns the versioned LLMThink language and audit boundary:

- DSL parsing and formatting
- AST and diagnostics contracts
- confidence propagation
- DSLQL evaluation
- audit report presentation
- runtime configuration retained for v1 API compatibility

Run only the Core checks while changing internal Core implementation:

```bash
npm run test:core
npm run typecheck:core
```

When the public exports or package version change, also run the downstream
contract gate:

```bash
npm run test:contract
```

Hosted server, thought persistence, LSP, plugin, and VS Code behavior are not
owned by this workspace and are intentionally excluded from its test command.
