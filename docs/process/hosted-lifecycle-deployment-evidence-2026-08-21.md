# Hosted lifecycle deployment evidence — 2026-08-21

- Deployment authority: owner approved the exact scope on 2026-08-21
- Candidate commit: `8c0c0cae992d2a8b9028aed65dde0e7af72b761d`
- Candidate tree: `0e254d8a00d1f86b2924aca38ae46c1c07ffb9f0`
- Git archive SHA-256: `664da6bc4b014f6bc104e2a9e359c1041b2240f1f17951b714c4977e10318d1a`
- npm tarball SHA-256: `86a2c86622c67672956fa2df1be6f597db8841bafa3bb1ae4badc0edfbadf205`
- Previous release: `e803cfe5777ed036cfa6ad8523504adac76c2666`
- Deployed release: `8c0c0cae992d2a8b9028aed65dde0e7af72b761d`
- Activation time: 2026-08-21 20:06:17 JST

## Initialization readback

The lifecycle database was created as `llmthink:llmthink` mode `0600`. The initialization receipt
and an independent post-restart readback agreed on:

| Artifact | SHA-256 |
| --- | --- |
| Trial terms | `b40e20f16af8f927027b34ca97c8a729d65178a93f999006f77e8a3821723af1` |
| Important summary | `c81803b0b85713ccc0a79908949774ece7023439fe34088051140d84e53fef2c` |
| Privacy Notice | `88028714e007f7aea2c5ef829b9fa42a9c428136eb3a8ced942669e83c9be610` |

All account, identity mapping, agreement, tenant, workspace, recovery, provisioning, and outbox
counts were zero. No participant was registered or invited.

## Runtime readback

- systemd: `active/running`, main process started at 20:06:17 JST;
- `https://llmthink.mk10.org/status`: HTTP 200;
- OAuth protected-resource metadata: HTTP 200 JSON;
- unauthenticated `/onboarding`: HTTP 401 HTML;
- unauthenticated `/mcp`: HTTP 401 JSON;
- legacy `LLMTHINK_OAUTH_ACCOUNT_REGISTRY_PATH`: absent;
- unknown external identity resolved through lifecycle authority: fail closed;
- `npm audit --omit=dev`: zero known production vulnerabilities at readback time.

The first readiness probe raced process startup and failed to connect once; the bounded retry then
succeeded without rollback. No service error appeared in the activation journal.

## Rollback readiness and excluded effects

The exact previous environment remains root-only at
`/etc/llmthink/hosted.env.pre-8c0c0cae992d2a8b9028aed65dde0e7af72b761d`, and the previous release
remains installed. Rollback would restore both and restart the unit; it would retain the lifecycle
database for investigation and later reconciliation.

No general registration, invitation, public Plugin discovery, billing, paid plan, or Production
classification was enabled. Authenticated document rendering, explicit agreement, recovery-token
delivery, and a participant MCP round trip require a separately authorized invited test identity.
