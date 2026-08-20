# Hosted MCP UX and OAuth plan

Status: implementation acceptance for MCP guidance; managed OAuth identity and
authorization boundary is accepted in ADR-0010. WorkOS remains the provisional
provider pending interoperability evidence and separate provider acceptance.

## Acceptance criteria

### MCP help and error navigation

- `llmthink_help` provides overview, tool, stable-error, DSL, storage, and
  authentication guidance without requiring a thought scope.
- DSL help reuses the same guidance source as `llmthink dsl help` rather than
  maintaining a second syntax description.
- Every domain error returned by an MCP tool includes bounded `next_actions`
  and a machine-readable request for the relevant `llmthink_help` topic.
- Tool descriptions state read/write effect, authenticated workspace boundary,
  and external persistence where applicable.

### User intent and storage disclosure

- A direct user request to create, reflect, or finalize is sufficient intent;
  Skills and tool descriptions do not require the user to repeat or reconfirm
  it.
- The MCP adapter may supply internal evidence of direct tool intent to the
  existing Application Service confirmation boundary. REST keeps its existing
  explicit confirmation contract.
- Tenant, workspace, scope, revision, and idempotency checks remain enforced by
  the server and cannot be changed by Skill text.
- Tenant is a hard isolation boundary. Project-scoped access may cross only
  explicitly granted workspaces in the same tenant and fails closed whenever
  membership or authorization cannot be verified.
- Before or while reporting a write, the agent briefly identifies llmthink as
  an external persistence boundary. This is a disclosure, not a question that
  blocks execution.

### OAuth

- Bearer tokens are validated for issuer, audience/resource, expiry, and
  required scopes; identity is derived only from validated claims.
- The MCP resource publishes protected-resource metadata and returns the
  standard authentication challenge needed for MCP OAuth discovery.
- Authorization Code with PKCE is supported. Refresh credentials remain at the
  client; llmthink never receives a Google password or ChatGPT credential.
- The authenticated subject maps deterministically to a tenant/workspace and
  cannot select another account boundary through tool arguments.
- Static bearer authentication remains a rollback-only operator path during
  migration and is removed from distributable plugin configuration after OAuth
  acceptance.

## OAuth decision

ChatGPT account-linked authentication is preferred only if OpenAI exposes a
supported third-party workload identity or token exchange whose audience can be
the llmthink MCP resource. Current public configuration treats ChatGPT-session
authentication as a trusted first-party fallback, so it must not be assumed to
be available to this independent server.

Recommended fallback:

1. Use a standards-compliant managed authorization server as the MCP OAuth
   issuer.
2. Configure Google as its upstream OpenID Connect identity provider.
3. Issue llmthink-specific access tokens with a fixed audience and bounded
   scopes.
4. Validate those tokens locally in llmthink through cached issuer metadata and
   signing keys.

Do not connect the MCP server directly to Google OAuth unless an interoperability
prototype proves MCP discovery, client registration, PKCE, resource/audience,
refresh, and ChatGPT/Codex login behavior end to end.

## OAuth implementation frontier

1. Select the managed authorization server and freeze issuer/audience/claim
   mapping.
2. Add protected-resource metadata and `WWW-Authenticate` discovery responses.
3. Add JWT validation and claim-to-`RequestContext` mapping behind the existing
   authenticator interface.
4. Run ChatGPT developer-mode and Codex OAuth login acceptance against a Stage
   issuer.
5. Replace plugin static bearer configuration only after restart, expiry,
   revocation, cross-account denial, and recovery evidence pass.

`think://<server-identity>/<path>`, cross-server references, non-MCP public API
identity, and cross-tenant publication or delegation are unstarted non-goals.
They require a separate requirements and authority decision before any design
or implementation work.
