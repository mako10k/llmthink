# ConoHa hosted MCP deployment

This deployment runs the packaged `llmthink-hosted-mcp` entry point as a
dedicated unprivileged user. The Node process binds only to loopback; Caddy owns
public ports and TLS.

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
