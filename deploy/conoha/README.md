# ConoHa hosted MCP deployment

This deployment runs the packaged `llmthink-hosted-mcp` entry point as a
dedicated unprivileged user. The Node process binds only to loopback; Caddy owns
public ports and TLS.

The service expects an official supported Node.js LTS installation at
`/opt/node/current`. Caddy uses Let's Encrypt's production ACME endpoint and
automatically renews the certificate before expiry.

Required `/etc/llmthink/hosted.env` values:

```text
LLMTHINK_HOSTED_HOST=127.0.0.1
LLMTHINK_HOSTED_PORT=3000
LLMTHINK_HOSTED_DATA_ROOT=/var/lib/llmthink/data
LLMTHINK_HOSTED_BEARER_TOKEN=<at-least-32-byte-secret>
LLMTHINK_HOSTED_SUBJECT_ID=deployment-user
LLMTHINK_HOSTED_TENANT_ID=deployment-tenant
LLMTHINK_HOSTED_WORKSPACE_ID=deployment-workspace
```

Keep the environment file root-readable and never commit the real token. OAuth
will replace the static deployment token before broader distribution.

Provider-neutral OAuth discovery can be enabled during the bounded migration
window while the static operator token remains available:

```text
LLMTHINK_OAUTH_RESOURCE=https://llmthink.mk10.org/mcp
LLMTHINK_OAUTH_AUTHORIZATION_SERVER=https://cozy-bamboo-05-staging.authkit.app
LLMTHINK_OAUTH_JWKS_URI=https://cozy-bamboo-05-staging.authkit.app/oauth2/jwks
LLMTHINK_OAUTH_ACCOUNT_REGISTRY_PATH=/etc/llmthink/oauth-accounts.json
```

All four values are required together. The authorization-server value is an
exact issuer string; do not add or remove a trailing slash to normalize it.
The registry must be a root-owned, service-group-readable (`root:llmthink
0640`) regular file with this bounded schema. Group write and all world access
are rejected:

```sh
install -d -o root -g llmthink -m 0710 /etc/llmthink
install -o root -g llmthink -m 0640 oauth-accounts.json \
  /etc/llmthink/oauth-accounts.json
```

The directory grants the service group traversal without directory listing;
the existing root-only `hosted.env` remains unreadable by the service user.

```json
{
  "version": 1,
  "accounts": [
    {
      "issuer": "https://cozy-bamboo-05-staging.authkit.app",
      "external_subject_id": "<WorkOS sub>",
      "subject_id": "<llmthink recovery-safe subject ID>",
      "tenant_id": "<fixed tenant ID>",
      "workspace_id": "<fixed workspace ID>",
      "scopes": ["thought:read"],
      "status": "active",
      "mapping_revision": 1
    }
  ]
}
```

Add `organization_id` only when the issued token contains an exact `org_id`
that must participate in the mapping key. The registry must not contain email,
display name, provider tokens, authorization codes, or credentials. During the
migration window the existing static token remains a separately bounded
rollback adapter; its presence does not authorize distributing it.
