#!/usr/bin/env node
import { timingSafeEqual } from "node:crypto";
import { realpathSync } from "node:fs";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { LlmthinkApplicationService } from "./application-service.js";
import { LLMTHINK_SERVER_SCOPES, LlmthinkServerError, } from "./contracts.js";
import { ServerFileThoughtRepository } from "./file-repository.js";
import { createLlmthinkHostedMcpServer } from "./hosted-mcp.js";
import { assertServerBindPolicy } from "./policy.js";
import { createBearerTokenAuthenticator } from "./security.js";
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
    return {
        hostname,
        port: parsePort(env.LLMTHINK_HOSTED_PORT),
        dataRoot,
        bearerToken,
        subjectId: env.LLMTHINK_HOSTED_SUBJECT_ID ?? "deployment-user",
        tenantId: env.LLMTHINK_HOSTED_TENANT_ID ?? "deployment-tenant",
        workspaceId: env.LLMTHINK_HOSTED_WORKSPACE_ID ?? "deployment-workspace",
        scopes: parseScopes(env.LLMTHINK_HOSTED_SCOPES),
    };
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
    const authenticate = createBearerTokenAuthenticator({
        verify: async (token) => {
            if (!tokenMatches(token, config.bearerToken)) {
                throw new LlmthinkServerError("unauthenticated", "Bearer token verification failed");
            }
            return {
                subjectId: config.subjectId,
                tenantId: config.tenantId,
                workspaceId: config.workspaceId,
                scopes: config.scopes,
            };
        },
    });
    const server = createLlmthinkHostedMcpServer({ application, authenticate });
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