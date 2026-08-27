import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, join, resolve, } from "node:path";
const WORKSPACE_MARKERS = [
    ".git",
    ".hg",
    ".svn",
    "package.json",
    "pnpm-workspace.yaml",
    "tsconfig.json",
    "pyproject.toml",
    "Cargo.toml",
    "go.mod",
];
function normalizeString(value) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}
function parseDomain(value) {
    if (value === "workspace" || value === "user" || value === "system") {
        return value;
    }
    return undefined;
}
function parseProvider(value) {
    if (value === "none" || value === "ollama" || value === "openai") {
        return value;
    }
    return undefined;
}
function parsePositiveNumber(value) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        return value;
    }
    if (typeof value === "string") {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed > 0) {
            return parsed;
        }
    }
    return undefined;
}
function trimTrailingSlash(value) {
    return value.endsWith("/") ? value.slice(0, -1) : value;
}
function resolveFrom(baseDir, maybePath) {
    return isAbsolute(maybePath)
        ? resolve(maybePath)
        : resolve(baseDir, maybePath);
}
function asRecord(value) {
    return value && typeof value === "object"
        ? value
        : undefined;
}
function aliasedString(record, camelCaseKey, snakeCaseKey) {
    return normalizeString(String(record[camelCaseKey] ?? record[snakeCaseKey] ?? ""));
}
function parseThoughtConfig(value) {
    const thought = asRecord(value);
    if (!thought) {
        return undefined;
    }
    return {
        storageDomain: parseDomain(aliasedString(thought, "storageDomain", "storage_domain")),
        storagePath: aliasedString(thought, "storagePath", "storage_path"),
    };
}
function parseEmbeddingEndpoint(value) {
    const endpoint = asRecord(value);
    if (!endpoint) {
        return undefined;
    }
    return {
        baseUrl: aliasedString(endpoint, "baseUrl", "base_url"),
        model: normalizeString(String(endpoint.model ?? "")),
    };
}
function parseEmbeddingsConfig(value) {
    const embeddings = asRecord(value);
    if (!embeddings) {
        return undefined;
    }
    const openaiRecord = asRecord(embeddings.openai);
    const openai = parseEmbeddingEndpoint(openaiRecord);
    return {
        provider: parseProvider(normalizeString(String(embeddings.provider ?? ""))),
        timeoutMs: parsePositiveNumber(embeddings.timeoutMs ?? embeddings.timeout_ms),
        ollama: parseEmbeddingEndpoint(embeddings.ollama),
        openai: openai
            ? {
                ...openai,
                apiKey: openaiRecord?.apiKey ??
                    openaiRecord?.api_key,
            }
            : undefined,
    };
}
function readConfigFile(filePath) {
    if (!filePath || !existsSync(filePath)) {
        return {};
    }
    const raw = JSON.parse(readFileSync(filePath, "utf8"));
    return {
        path: filePath,
        config: {
            thought: parseThoughtConfig(raw.thought),
            embeddings: parseEmbeddingsConfig(raw.embeddings),
        },
    };
}
function findWorkspaceConfigPath(startDir) {
    let current = resolve(startDir);
    while (true) {
        const candidate = join(current, ".llmthinkrc");
        if (existsSync(candidate)) {
            return candidate;
        }
        const parent = dirname(current);
        if (parent === current) {
            return undefined;
        }
        current = parent;
    }
}
function resolveWorkspaceSearchDir(options) {
    const cwd = resolve(options.cwd ?? process.cwd());
    if (options.filePath) {
        return dirname(resolveFrom(cwd, options.filePath));
    }
    if (options.workspaceDir) {
        return resolve(options.workspaceDir);
    }
    return cwd;
}
function resolveUserConfigPath(env) {
    const xdgConfigHome = normalizeString(env.XDG_CONFIG_HOME);
    if (xdgConfigHome) {
        const xdgPath = join(resolve(xdgConfigHome), "llmthink", "config.json");
        if (existsSync(xdgPath)) {
            return xdgPath;
        }
    }
    const legacyPath = join(homedir(), ".llmthinkrc");
    return existsSync(legacyPath) ? legacyPath : undefined;
}
function resolveSystemConfigPath() {
    const candidate = "/etc/llmthinkrc";
    return existsSync(candidate) ? candidate : undefined;
}
function stateHome(env) {
    const xdgStateHome = normalizeString(env.XDG_STATE_HOME);
    if (xdgStateHome) {
        return resolve(xdgStateHome);
    }
    return join(homedir(), ".local", "state");
}
function datastoreBaseRoot(env) {
    return join(stateHome(env), "llmthink");
}
function hasWorkspaceMarker(dir) {
    return WORKSPACE_MARKERS.some((marker) => existsSync(join(dir, marker)));
}
function findWorkspaceDomainRoot(startDir) {
    let current = resolve(startDir);
    while (true) {
        if (hasWorkspaceMarker(current)) {
            return current;
        }
        const parent = dirname(current);
        if (parent === current) {
            return undefined;
        }
        current = parent;
    }
}
function sanitizeWorkspaceName(dir) {
    const name = basename(dir).trim() || "workspace";
    let sanitized = "";
    for (const character of name.toLowerCase()) {
        const code = character.codePointAt(0) ?? 0;
        const isLetter = code >= 97 && code <= 122;
        const isDigit = code >= 48 && code <= 57;
        const normalized = isLetter || isDigit ? character : "-";
        if (normalized !== "-" || !sanitized.endsWith("-")) {
            sanitized += normalized;
        }
    }
    sanitized = sanitized.replace(/^-|-$/g, "");
    return sanitized || "workspace";
}
function workspaceDomainId(dir) {
    const digest = createHash("sha256").update(dir).digest("hex").slice(0, 12);
    return `${sanitizeWorkspaceName(dir)}-${digest}`;
}
function resolveWorkspaceDomainDir(options) {
    const searchDir = resolveWorkspaceSearchDir(options);
    return findWorkspaceDomainRoot(searchDir) ?? searchDir;
}
function loadConfigLayers(options) {
    const env = options.env ?? process.env;
    const workspacePath = options.configFilePath
        ? resolveFrom(resolve(options.cwd ?? process.cwd()), options.configFilePath)
        : findWorkspaceConfigPath(resolveWorkspaceSearchDir(options));
    return {
        workspace: readConfigFile(workspacePath),
        user: readConfigFile(resolveUserConfigPath(env)),
        system: readConfigFile(resolveSystemConfigPath()),
    };
}
function userStorageRoot(env) {
    return join(datastoreBaseRoot(env), "user");
}
function systemStorageRoot() {
    return "/var/lib/llmthink/system";
}
function defaultWorkspaceStorageRoot(options) {
    const env = options.env ?? process.env;
    const workspaceDir = resolveWorkspaceDomainDir(options);
    return join(datastoreBaseRoot(env), "workspace", workspaceDomainId(workspaceDir));
}
function defaultStorageRootForDomain(domain, options) {
    const env = options.env ?? process.env;
    if (domain === "workspace") {
        return defaultWorkspaceStorageRoot(options);
    }
    if (domain === "user") {
        return userStorageRoot(env);
    }
    return systemStorageRoot();
}
function runCommand(command, cwd) {
    const windowsShell = "C:\\Windows\\System32\\cmd.exe";
    const result = process.platform === "win32"
        ? execFileSync(windowsShell, ["/d", "/s", "/c", command], {
            cwd,
            encoding: "utf8",
        })
        : execFileSync("/bin/sh", ["-c", command], {
            cwd,
            encoding: "utf8",
        });
    return result.trim();
}
function resolveExecutable(command, env) {
    const names = process.platform === "win32"
        ? [`${command}.exe`, `${command}.cmd`, command]
        : [command];
    for (const directory of (env.PATH ?? "").split(delimiter).filter(Boolean)) {
        for (const name of names) {
            const candidate = resolve(directory, name);
            try {
                accessSync(candidate, constants.X_OK);
                return candidate;
            }
            catch {
                // Try the next fixed candidate from PATH.
            }
        }
    }
    throw new Error(`Executable '${command}' was not found on PATH.`);
}
function resolveSecdatReference(specification, layerPath, env) {
    const secdatSpec = typeof specification === "string" ? { key: specification } : specification;
    const key = normalizeString(secdatSpec.key);
    if (!key) {
        return undefined;
    }
    const args = [];
    const dir = normalizeString(secdatSpec.dir);
    if (dir) {
        const resolvedDir = layerPath
            ? resolveFrom(dirname(layerPath), dir)
            : resolve(dir);
        args.push("--dir", resolvedDir);
    }
    args.push("get", key);
    const executable = resolveExecutable("secdat", env);
    return normalizeString(execFileSync(executable, args, { encoding: "utf8" }).trim());
}
function resolveSecretReference(secret, layerPath, env) {
    if (!secret) {
        return undefined;
    }
    if (typeof secret === "string") {
        return normalizeString(secret);
    }
    if (typeof secret !== "object") {
        return undefined;
    }
    if (typeof secret.value === "string") {
        return normalizeString(secret.value);
    }
    if (typeof secret.env === "string") {
        return normalizeString(env[secret.env]);
    }
    if (typeof secret.command === "string") {
        return normalizeString(runCommand(secret.command, layerPath ? dirname(layerPath) : process.cwd()));
    }
    if (secret.secdat) {
        return resolveSecdatReference(secret.secdat, layerPath, env);
    }
    return undefined;
}
function firstResolved(...candidates) {
    return candidates.find((candidate) => candidate !== undefined);
}
function layerSource(layer, key, path) {
    return { layer, key, path };
}
function inferDomainFromLayer(layer) {
    return layer;
}
function resolveStorageFromLayer(layerName, layer, options) {
    const thought = layer.config?.thought;
    if (!thought) {
        return undefined;
    }
    if (thought.storagePath) {
        const baseDir = layer.path
            ? dirname(layer.path)
            : resolve(options.cwd ?? process.cwd());
        return {
            value: {
                root: resolveFrom(baseDir, thought.storagePath),
                domain: thought.storageDomain ?? inferDomainFromLayer(layerName),
            },
            source: layerSource(layerName, "thought.storagePath", layer.path),
        };
    }
    if (thought.storageDomain) {
        return {
            value: {
                root: defaultStorageRootForDomain(thought.storageDomain, options),
                domain: thought.storageDomain,
            },
            source: layerSource(layerName, "thought.storageDomain", layer.path),
        };
    }
    return undefined;
}
function resolveStorageDomainSource(storageSource, storage) {
    if (storageSource.key === "thought.storagePath") {
        return {
            layer: storageSource.layer,
            key: `inferred:${storage.domain}`,
            path: storageSource.path,
        };
    }
    return storageSource;
}
function sourceCandidate(value, source) {
    return value === undefined ? undefined : { value, source };
}
function resolveLayeredSetting(layers, key, read, environmentCandidate, defaultCandidate) {
    const layerNames = ["workspace", "user", "system"];
    const layerCandidates = layerNames.map((name) => {
        const layer = layers[name];
        return sourceCandidate(read(layer), layerSource(name, key, layer.path));
    });
    return firstResolved(...layerCandidates, environmentCandidate, defaultCandidate);
}
function resolveStorageSetting(options, layers, env) {
    const envStoragePath = normalizeString(env.LLMTHINK_STORAGE_PATH);
    const envStorageDomain = parseDomain(normalizeString(env.LLMTHINK_STORAGE_DOMAIN));
    const cwd = resolve(options.cwd ?? process.cwd());
    return firstResolved(sourceCandidate(options.storagePath
        ? {
            root: resolveFrom(cwd, options.storagePath),
            domain: options.storageDomain ?? "workspace",
        }
        : undefined, { layer: "cli", key: "storagePath" }), sourceCandidate(options.storageDomain
        ? {
            root: defaultStorageRootForDomain(options.storageDomain, options),
            domain: options.storageDomain,
        }
        : undefined, { layer: "cli", key: "storageDomain" }), resolveStorageFromLayer("workspace", layers.workspace, options), resolveStorageFromLayer("user", layers.user, options), resolveStorageFromLayer("system", layers.system, options), sourceCandidate(envStoragePath
        ? {
            root: resolveFrom(cwd, envStoragePath),
            domain: envStorageDomain ?? "workspace",
        }
        : undefined, { layer: "env", key: "LLMTHINK_STORAGE_PATH" }), sourceCandidate(envStorageDomain
        ? {
            root: defaultStorageRootForDomain(envStorageDomain, options),
            domain: envStorageDomain,
        }
        : undefined, { layer: "env", key: "LLMTHINK_STORAGE_DOMAIN" }), {
        value: {
            root: defaultWorkspaceStorageRoot(options),
            domain: "workspace",
        },
        source: { layer: "default", key: "workspace-default" },
    });
}
function resolveProviderSetting(layers, env) {
    return resolveLayeredSetting(layers, "embeddings.provider", (layer) => layer.config?.embeddings?.provider, sourceCandidate(parseProvider(normalizeString(env.LLMTHINK_EMBEDDING_PROVIDER)), { layer: "env", key: "LLMTHINK_EMBEDDING_PROVIDER" }), {
        value: "ollama",
        source: { layer: "default", key: "provider-default" },
    });
}
function resolveTimeoutSetting(layers, env) {
    return resolveLayeredSetting(layers, "embeddings.timeoutMs", (layer) => layer.config?.embeddings?.timeoutMs, sourceCandidate(parsePositiveNumber(env.LLMTHINK_EMBEDDING_TIMEOUT_MS), {
        layer: "env",
        key: "LLMTHINK_EMBEDDING_TIMEOUT_MS",
    }), {
        value: 3000,
        source: { layer: "default", key: "timeout-default" },
    });
}
function trimOptionalUrl(value) {
    return value ? trimTrailingSlash(value) : undefined;
}
function resolveStringSetting(layers, key, read, environmentValue, environmentKey, defaultValue, defaultKey) {
    return resolveLayeredSetting(layers, key, read, sourceCandidate(environmentValue, {
        layer: "env",
        key: environmentKey,
    }), {
        value: defaultValue,
        source: { layer: "default", key: defaultKey },
    });
}
function resolveOpenaiApiKeySetting(layers, env) {
    return resolveLayeredSetting(layers, "embeddings.openai.apiKey", (layer) => resolveSecretReference(layer.config?.embeddings?.openai?.apiKey, layer.path, env), sourceCandidate(normalizeString(env.OPENAI_API_KEY), {
        layer: "env",
        key: "OPENAI_API_KEY",
    }), {
        value: "",
        source: { layer: "default", key: "openai-api-key-unset" },
    });
}
export function resolveThoughtStorageRoot(options = {}) {
    return resolveRuntimeConfig(options).storage.root;
}
export function resolveEmbeddingConfig(options = {}) {
    return resolveRuntimeConfig(options).embeddings;
}
export function resolveRuntimeConfig(options = {}) {
    const env = options.env ?? process.env;
    const layers = loadConfigLayers(options);
    const storageResolved = resolveStorageSetting(options, layers, env);
    const storage = storageResolved.value;
    const providerResolved = resolveProviderSetting(layers, env);
    const timeoutResolved = resolveTimeoutSetting(layers, env);
    const ollamaBaseUrlResolved = resolveStringSetting(layers, "embeddings.ollama.baseUrl", (layer) => trimOptionalUrl(layer.config?.embeddings?.ollama?.baseUrl), trimOptionalUrl(normalizeString(env.OLLAMA_BASE_URL)), "OLLAMA_BASE_URL", "http://127.0.0.1:11434", "ollama-base-url-default");
    const ollamaModelResolved = resolveStringSetting(layers, "embeddings.ollama.model", (layer) => layer.config?.embeddings?.ollama?.model, normalizeString(env.OLLAMA_EMBED_MODEL), "OLLAMA_EMBED_MODEL", "nomic-embed-text", "ollama-model-default");
    const openaiBaseUrlResolved = resolveStringSetting(layers, "embeddings.openai.baseUrl", (layer) => trimOptionalUrl(layer.config?.embeddings?.openai?.baseUrl), trimOptionalUrl(normalizeString(env.OPENAI_BASE_URL)), "OPENAI_BASE_URL", "https://api.openai.com/v1", "openai-base-url-default");
    const openaiModelResolved = resolveStringSetting(layers, "embeddings.openai.model", (layer) => layer.config?.embeddings?.openai?.model, normalizeString(env.OPENAI_EMBED_MODEL), "OPENAI_EMBED_MODEL", "text-embedding-3-small", "openai-model-default");
    const openaiApiKeyResolved = resolveOpenaiApiKeySetting(layers, env);
    return {
        configPaths: {
            workspace: layers.workspace.path,
            user: layers.user.path,
            system: layers.system.path,
        },
        storage,
        embeddings: {
            provider: providerResolved.value,
            timeoutMs: timeoutResolved.value,
            ollamaBaseUrl: ollamaBaseUrlResolved.value,
            ollamaModel: ollamaModelResolved.value,
            openaiBaseUrl: openaiBaseUrlResolved.value,
            openaiModel: openaiModelResolved.value,
            openaiApiKey: openaiApiKeyResolved.value || undefined,
        },
        sources: {
            storage: {
                root: storageResolved.source,
                domain: resolveStorageDomainSource(storageResolved.source, storage),
            },
            embeddings: {
                provider: providerResolved.source,
                timeoutMs: timeoutResolved.source,
                ollamaBaseUrl: ollamaBaseUrlResolved.source,
                ollamaModel: ollamaModelResolved.source,
                openaiBaseUrl: openaiBaseUrlResolved.source,
                openaiModel: openaiModelResolved.source,
                openaiApiKey: openaiApiKeyResolved.source,
            },
        },
    };
}
//# sourceMappingURL=runtime.js.map