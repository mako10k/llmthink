# Onboarding browser bridge deployment evidence — 2026-08-21

- Candidate commit: `1e9394cba7fac1129dbbf6750368c203880e2003`
- Candidate tree: `86c498b122edaa2f29de396eb81332b1f5d9f614`
- Git archive SHA-256: `e862ecf7cc5ab49030d634df592d822584814031a1a230aca991d043b4e885fd`
- npm tarball SHA-256: `be3a07653489347d07c242e8945e50cf1054413feebffbba04f37dc402890a23`
- Previous release: `04698f4469dff57dee3be63a7933cfaaea31fbeb`
- Deployment date: 2026-08-21

The service activated the exact candidate and remained active. Public readback returned HTTP 200
for the onboarding bootstrap HTML and fixed same-origin JavaScript, while unauthenticated MCP
remained HTTP 401.

The separately configured and already OAuth-authenticated `llmthink_trial` client exposed exactly
one tool: `begin_llmthink_onboarding`. The tool was called exactly once. Its result reported a
same-origin `/onboarding` URL with a fragment, a 600-second lifetime, and
`agreement_recorded=false`. The returned URL was not opened or fetched.

The MCP diagnostic stream necessarily contained the one-time fragment value. The service was
therefore restarted immediately after the structural readback, invalidating every in-memory ticket.
The fragment value is intentionally omitted from this evidence. Post-restart account, external
identity mapping, agreement receipt, tenant, and workspace counts were all zero.

No terms page was exchanged from the ticket, no agreement action was submitted, and no account,
tenant, workspace, recovery credential, thought, invitation, billing state, or Production setting
was created. The previous release remains installed for rollback.
