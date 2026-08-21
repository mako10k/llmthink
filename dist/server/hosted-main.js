#!/usr/bin/env node
import { randomUUID, timingSafeEqual } from "node:crypto";
import { realpathSync } from "node:fs";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { LlmthinkApplicationService } from "./application-service.js";
import { LLMTHINK_SERVER_SCOPES, LlmthinkServerError, } from "./contracts.js";
import { ServerFileThoughtRepository } from "./file-repository.js";
import { createLlmthinkHostedMcpServer } from "./hosted-mcp.js";
import { createLlmthinkOAuthDiscovery, } from "./oauth-discovery.js";
import { loadOAuthAccountRegistry } from "./oauth-account-registry.js";
import { createLlmthinkJwtIdentityVerifier, createLlmthinkRemoteJwks, } from "./oauth-jwt.js";
import { createLlmthinkOnboardingHandler, } from "./onboarding.js";
import { assertServerBindPolicy } from "./policy.js";
import { createBearerTokenAuthenticator, } from "./security.js";
import { SqliteLifecycleStore } from "./sqlite-lifecycle-store.js";
const OAUTH_TOKEN_SCOPES = [
    "openid",
    "email",
    "profile",
    "offline_access",
];
function required(env, name) {
    const value = env[name];
    if (!value)
        throw new Error(`${name} is required`);
    return value;
}
function parsePort(value) {
    const port = Number(value ?? "3000");
    if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
        throw new Error("LLMTHINK_HOSTED_PORT must be an integer from 1 to 65535");
    }
    return port;
}
function parseScopes(value) {
    const requested = (value ?? LLMTHINK_SERVER_SCOPES.join(","))
        .split(",")
        .map((scope) => scope.trim())
        .filter(Boolean);
    const known = new Set(LLMTHINK_SERVER_SCOPES);
    if (requested.length === 0 || requested.some((scope) => !known.has(scope))) {
        throw new Error("LLMTHINK_HOSTED_SCOPES contains an unsupported scope");
    }
    return requested;
}
function parseOAuthRuntime(env) {
    const resource = env.LLMTHINK_OAUTH_RESOURCE;
    const issuer = env.LLMTHINK_OAUTH_AUTHORIZATION_SERVER;
    const jwksUri = env.LLMTHINK_OAUTH_JWKS_URI;
    const registryPath = env.LLMTHINK_OAUTH_ACCOUNT_REGISTRY_PATH;
    const values = [resource, issuer, jwksUri];
    if (!values.some(Boolean))
        return {};
    if (!resource || !issuer || !jwksUri) {
        throw new Error("OAuth resource, authorization server, and JWKS URI must be configured together");
    }
    return {
        oauthDiscovery: createLlmthinkOAuthDiscovery({
            resource,
            authorizationServers: [issuer],
            scopesSupported: OAUTH_TOKEN_SCOPES,
            ...(env.LLMTHINK_OAUTH_RESOURCE_DOCUMENTATION
                ? { resourceDocumentation: env.LLMTHINK_OAUTH_RESOURCE_DOCUMENTATION }
                : {}),
        }),
        oauthJwksUri: jwksUri,
        ...(registryPath ? { oauthAccountRegistryPath: registryPath } : {}),
    };
}
function parseLifecycleRuntime(env) {
    const databasePath = env.LLMTHINK_LIFECYCLE_DATABASE_PATH;
    const publicOrigin = env.LLMTHINK_ONBOARDING_PUBLIC_ORIGIN;
    const termsId = env.LLMTHINK_ONBOARDING_TERMS_ID;
    const privacyNoticeId = env.LLMTHINK_ONBOARDING_PRIVACY_NOTICE_ID;
    const scopePolicyId = env.LLMTHINK_ONBOARDING_SCOPE_POLICY_ID;
    const values = [
        databasePath,
        publicOrigin,
        termsId,
        privacyNoticeId,
        scopePolicyId,
    ];
    if (!values.some(Boolean))
        return undefined;
    if (values.some((value) => !value)) {
        throw new Error("Lifecycle and onboarding configuration must be complete");
    }
    if (!isAbsolute(databasePath)) {
        throw new Error("Lifecycle database path must be absolute");
    }
    return {
        databasePath: databasePath,
        publicOrigin: publicOrigin,
        termsId: termsId,
        privacyNoticeId: privacyNoticeId,
        scopePolicyId: scopePolicyId,
    };
}
function assertAuthorityConfiguration(oauth, lifecycle) {
    if (lifecycle && !oauth.oauthDiscovery) {
        throw new Error("Lifecycle onboarding requires OAuth configuration");
    }
    if (lifecycle && oauth.oauthAccountRegistryPath) {
        throw new Error("Lifecycle onboarding and the legacy OAuth account registry cannot be enabled together");
    }
    if (oauth.oauthDiscovery && !lifecycle && !oauth.oauthAccountRegistryPath) {
        throw new Error("OAuth requires an account registry or lifecycle database");
    }
}
export function loadHostedMcpRuntimeConfig(env) {
    const hostname = env.LLMTHINK_HOSTED_HOST ?? "127.0.0.1";
    const dataRoot = required(env, "LLMTHINK_HOSTED_DATA_ROOT");
    const bearerToken = required(env, "LLMTHINK_HOSTED_BEARER_TOKEN");
    if (!isAbsolute(dataRoot)) {
        throw new Error("LLMTHINK_HOSTED_DATA_ROOT must be absolute");
    }
    if (Buffer.byteLength(bearerToken) < 32) {
        throw new Error("LLMTHINK_HOSTED_BEARER_TOKEN must be at least 32 bytes");
    }
    assertServerBindPolicy({ hostname, authenticationEnabled: true });
    const scopes = parseScopes(env.LLMTHINK_HOSTED_SCOPES);
    const oauth = parseOAuthRuntime(env);
    const lifecycle = parseLifecycleRuntime(env);
    assertAuthorityConfiguration(oauth, lifecycle);
    return {
        hostname,
        port: parsePort(env.LLMTHINK_HOSTED_PORT),
        dataRoot,
        bearerToken,
        subjectId: env.LLMTHINK_HOSTED_SUBJECT_ID ?? "deployment-user",
        tenantId: env.LLMTHINK_HOSTED_TENANT_ID ?? "deployment-tenant",
        workspaceId: env.LLMTHINK_HOSTED_WORKSPACE_ID ?? "deployment-workspace",
        scopes,
        ...oauth,
        ...(lifecycle ? { lifecycle } : {}),
    };
}
function createIdentityVerifier(config) {
    if (!config.oauthDiscovery || !config.oauthJwksUri)
        return undefined;
    return createLlmthinkJwtIdentityVerifier({
        issuer: config.oauthDiscovery.authorizationServers[0],
        audience: config.oauthDiscovery.resource,
        jwks: createLlmthinkRemoteJwks({ jwksUri: config.oauthJwksUri }),
        allowedTokenScopes: OAUTH_TOKEN_SCOPES,
        requiredTokenScopes: ["openid"],
    });
}
async function createOAuthVerifier(config, identityVerify, lifecycleStore) {
    if (!identityVerify)
        return undefined;
    const accountResolver = lifecycleStore
        ? lifecycleStore.accountResolver()
        : await loadOAuthAccountRegistry(config.oauthAccountRegistryPath);
    return async (token) => accountResolver(await identityVerify(token));
}
function createOnboarding(config, identityVerify, lifecycleStore) {
    if (!config.lifecycle || !identityVerify || !lifecycleStore)
        return undefined;
    return createLlmthinkOnboardingHandler({
        store: lifecycleStore,
        authenticate: async (request) => {
            const authorization = request.headers.authorization;
            const match = typeof authorization === "string"
                ? /^Bearer ([^\s]+)$/.exec(authorization)
                : null;
            if (!match)
                throw new Error("Bearer authentication is required");
            return {
                identity: await identityVerify(match[1]),
                requestId: randomUUID(),
            };
        },
        publicOrigin: config.lifecycle.publicOrigin,
        termsId: config.lifecycle.termsId,
        privacyNoticeId: config.lifecycle.privacyNoticeId,
        scopePolicyId: config.lifecycle.scopePolicyId,
        realizeInitialWorkspace: (tenantId, workspaceId) => lifecycleStore.markInitialWorkspaceRealized(tenantId, workspaceId),
    });
}
function tokenMatches(actual, expected) {
    const actualBytes = Buffer.from(actual);
    const expectedBytes = Buffer.from(expected);
    return (actualBytes.length === expectedBytes.length &&
        timingSafeEqual(actualBytes, expectedBytes));
}
export async function startHostedMcpServer(config) {
    const application = new LlmthinkApplicationService({
        repository: new ServerFileThoughtRepository({ dataRoot: config.dataRoot }),
    });
    const lifecycleStore = config.lifecycle
        ? new SqliteLifecycleStore({ path: config.lifecycle.databasePath })
        : undefined;
    if (lifecycleStore && config.lifecycle) {
        lifecycleStore.activeTermsArtifact(config.lifecycle.termsId);
        lifecycleStore.activeTermsArtifact(config.lifecycle.privacyNoticeId, "privacy_notice");
    }
    const identityVerify = createIdentityVerifier(config);
    const oauthVerify = await createOAuthVerifier(config, identityVerify, lifecycleStore);
    const onboarding = createOnboarding(config, identityVerify, lifecycleStore);
    const authenticate = createBearerTokenAuthenticator({
        verify: async (token) => {
            if (tokenMatches(token, config.bearerToken)) {
                return {
                    subjectId: config.subjectId,
                    tenantId: config.tenantId,
                    workspaceId: config.workspaceId,
                    scopes: config.scopes,
                };
            }
            if (oauthVerify)
                return oauthVerify(token);
            throw new LlmthinkServerError("unauthenticated", "Bearer token verification failed");
        },
    });
    const server = createLlmthinkHostedMcpServer({
        application,
        authenticate,
        ...(config.oauthDiscovery ? { oauthDiscovery: config.oauthDiscovery } : {}),
        ...(onboarding ? { onboarding } : {}),
    });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(config.port, config.hostname, () => {
            server.off("error", reject);
            resolve();
        });
    });
    process.stdout.write(`llmthink hosted MCP listening on ${config.hostname}:${config.port}\n`);
    const stop = async (signal) => {
        process.stdout.write(`llmthink hosted MCP stopping on ${signal}\n`);
        await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
        lifecycleStore?.close();
    };
    for (const signal of ["SIGINT", "SIGTERM"]) {
        process.once(signal, () => {
            stop(signal).then(() => process.exit(0), () => process.exit(1));
        });
    }
}
if (process.argv[1] &&
    realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
    await startHostedMcpServer(loadHostedMcpRuntimeConfig(process.env));
}
//# sourceMappingURL=hosted-main.js.map