# OAuth scope correction deployment evidence — 2026-08-21

- Candidate commit: `04698f4469dff57dee3be63a7933cfaaea31fbeb`
- Candidate tree: `35c4c4faa55ac98b3a441b0fde7c619c0be8fbeb`
- Git archive SHA-256: `467f5b0283b3b440b7a4ed3e04a0e53e844c4df6aaccefdc27011bfffddc7938`
- npm tarball SHA-256: `63308c98b880c45d03e303d750c54e68d223a8800978880eb4deafcd30c90915`
- Previous release: `8c0c0cae992d2a8b9028aed65dde0e7af72b761d`
- Activation time: 2026-08-21 20:13:40 JST

The protected-resource metadata readback advertises only `openid`, `email`, `profile`, and
`offline_access`. It no longer incorrectly advertises llmthink application permissions such as
`thought:read` as OAuth authorization-server scopes.

The service is active/running. Unauthenticated `/onboarding` and `/mcp` return HTTP 401. The
existing lifecycle SQLite file remains mode `0600`, and account, identity-mapping, agreement,
tenant, and workspace counts remain zero. `npm audit --omit=dev` reported zero known production
vulnerabilities at readback time. The prior release remains installed for rollback.

No registration, invitation, agreement, participant token, billing, public discovery, or
Production classification was created or enabled.
