# Deployable lifecycle runtime candidate

- Status: local implementation candidate; not deployed or activated
- Date: 2026-08-21
- Scope: limited free trial only

## Runtime boundary

When lifecycle onboarding is enabled, the hosted process uses one verified OAuth identity in two
different authorization paths:

1. `/onboarding` accepts the cryptographically verified external issuer/subject identity without
   granting a tenant, workspace, or MCP scope.
2. `/mcp` resolves the same identity through the lifecycle SQLite account, tenant, workspace, and
   scope-policy tables. Missing agreement, incomplete realization, suspension, re-consent, or an
   unknown identity fails closed.

The legacy JSON OAuth account registry and lifecycle authority are mutually exclusive. The static
operator bearer token remains available for rollback-compatible operation and does not enroll a
trial participant.

The file repository creates thought paths lazily from an already-authorized internal context. The
hosted onboarding path therefore completes the lifecycle outbox transition immediately after the
provisioning transaction; normal access is unavailable until that transition commits. The
provisioned tenant/workspace identifiers come only from the committed lifecycle transaction.

## One-time database initialization

Initialization is an explicit operation, separate from service startup. It refuses an existing
database, verifies the exact SHA-256 of all three owner-approved UTF-8 documents, inserts and
activates their immutable rows, and installs the fixed trial scope policy. A failed first
initialization removes only the newly-created database and its SQLite sidecars.

Candidate command shape (not authorized for Production execution by this document):

```sh
/opt/node/current/bin/node /opt/llmthink/CANDIDATE/dist/server/lifecycle-init.js \
  --database /var/lib/llmthink/lifecycle.sqlite \
  --manifest /opt/llmthink/CANDIDATE/docs/process/trial-lifecycle-init-manifest.json
```

The command emits a non-secret JSON receipt containing the database path, artifact IDs and
digests, scope-policy ID, and zero-account table counts. The operator must compare these values to
the accepted manifest before changing the service environment.

## Complete environment contract

These variables must be supplied together with the existing hosted and OAuth trust variables:

```text
LLMTHINK_LIFECYCLE_DATABASE_PATH=/var/lib/llmthink/lifecycle.sqlite
LLMTHINK_ONBOARDING_PUBLIC_ORIGIN=https://llmthink.mk10.org
LLMTHINK_ONBOARDING_TERMS_ID=trial-terms-ja-v1
LLMTHINK_ONBOARDING_PRIVACY_NOTICE_ID=trial-privacy-ja-v2
LLMTHINK_ONBOARDING_SCOPE_POLICY_ID=trial-default-v1
```

`LLMTHINK_OAUTH_ACCOUNT_REGISTRY_PATH` must be removed when these variables are enabled. Partial
configuration, simultaneous legacy-registry configuration, missing active artifacts, unsafe
database permissions, invalid OAuth trust, or an unsupported schema aborts startup.

## Deployment/readback gate

Deployment remains a separate owner-authorized action. Its candidate must be an exact clean Git
revision and must pass build and repository tests. Readback must cover:

- active release revision and service state;
- OAuth protected-resource discovery and unauthenticated MCP challenge;
- unauthenticated `/onboarding` denial;
- an invited test identity seeing the exact terms versions and SHA-256 values;
- explicit agreement creating exactly one account and one tenant/workspace;
- the invited identity resolving only its own tenant/workspace;
- an unknown identity and cross-tenant request failing closed;
- rollback to the prior release without deleting the lifecycle database.

General registration, invitation, public Plugin discovery, billing, paid terms, and Production
classification remain excluded.
