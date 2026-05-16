import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

export type ConfigDomain = "workspace" | "user" | "system";
export type ConfigEmbeddingProvider = "none" | "ollama" | "openai";

export interface ResolveRuntimeConfigOptions {
  cwd?: string;
  workspaceDir?: string;
  filePath?: string;
  configFilePath?: string;
  storageDomain?: ConfigDomain;
  storagePath?: string;
  env?: NodeJS.ProcessEnv;
}

export interface ResolvedEmbeddingConfig {
  provider: ConfigEmbeddingProvider;
  timeoutMs: number;
  ollamaBaseUrl: string;
  ollamaModel: string;
  openaiBaseUrl: string;
  openaiModel: string;
  openaiApiKey?: string;
}

export interface ResolvedValueSource {
  layer: ConfigDomain | "env" | "cli" | "default";
  key: string;
  path?: string;
}

export interface ResolvedRuntimeConfig {
  configPaths: {
    workspace?: string;
    user?: string;
    system?: string;
  };
  storage: {
    root: string;
    domain: ConfigDomain;
  };
  embeddings: ResolvedEmbeddingConfig;
  sources: {
    storage: {
      root: ResolvedValueSource;
      domain: ResolvedValueSource;
    };
    embeddings: {
      provider: ResolvedValueSource;
      timeoutMs: ResolvedValueSource;
      ollamaBaseUrl: ResolvedValueSource;
      ollamaModel: ResolvedValueSource;
      openaiBaseUrl: ResolvedValueSource;
      openaiModel: ResolvedValueSource;
      openaiApiKey: ResolvedValueSource;
    };
  };
}

type SecretReference =
  | string
  | {
      value?: string;
      env?: string;
      command?: string;
      secdat?: string | { key?: string; dir?: string };
    };

interface ConfigFile {
  thought?: {
    storageDomain?: ConfigDomain;
    storagePath?: string;
  };
  embeddings?: {
    provider?: ConfigEmbeddingProvider;
    timeoutMs?: number;
    ollama?: {
      baseUrl?: string;
      model?: string;
    };
    openai?: {
      baseUrl?: string;
      model?: string;
      apiKey?: SecretReference;
    };
  };
}

interface ConfigLayer {
  path?: string;
  config?: ConfigFile;
}

interface ResolvedCandidate<T> {
  value: T;
  source: ResolvedValueSource;
}

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
] as const;

function normalizeString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseDomain(value: string | undefined): ConfigDomain | undefined {
  if (value === "workspace" || value === "user" || value === "system") {
    return value;
  }
  return undefined;
}

function parseProvider(
  value: string | undefined,
): ConfigEmbeddingProvider | undefined {
  if (value === "none" || value === "ollama" || value === "openai") {
    return value;
  }
  return undefined;
}

function parsePositiveNumber(value: unknown): number | undefined {
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

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function resolveFrom(baseDir: string, maybePath: string): string {
  return isAbsolute(maybePath) ? resolve(maybePath) : resolve(baseDir, maybePath);
}

function readConfigFile(filePath: string | undefined): ConfigLayer {
  if (!filePath || !existsSync(filePath)) {
    return {};
  }

  const raw = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
  const thought =
    raw.thought && typeof raw.thought === "object"
      ? (raw.thought as Record<string, unknown>)
      : undefined;
  const embeddings =
    raw.embeddings && typeof raw.embeddings === "object"
      ? (raw.embeddings as Record<string, unknown>)
      : undefined;
  const ollama =
    embeddings?.ollama && typeof embeddings.ollama === "object"
      ? (embeddings.ollama as Record<string, unknown>)
      : undefined;
  const openai =
    embeddings?.openai && typeof embeddings.openai === "object"
      ? (embeddings.openai as Record<string, unknown>)
      : undefined;

  return {
    path: filePath,
    config: {
      thought: thought
        ? {
            storageDomain: parseDomain(
              normalizeString(
                String(
                  thought.storageDomain ?? thought.storage_domain ?? "",
                ),
              ),
            ),
            storagePath: normalizeString(
              String(thought.storagePath ?? thought.storage_path ?? ""),
            ),
          }
        : undefined,
      embeddings: embeddings
        ? {
            provider: parseProvider(
              normalizeString(
                String(embeddings.provider ?? ""),
              ),
            ),
            timeoutMs: parsePositiveNumber(
              embeddings.timeoutMs ?? embeddings.timeout_ms,
            ),
            ollama: ollama
              ? {
                  baseUrl: normalizeString(
                    String(ollama.baseUrl ?? ollama.base_url ?? ""),
                  ),
                  model: normalizeString(String(ollama.model ?? "")),
                }
              : undefined,
            openai: openai
              ? {
                  baseUrl: normalizeString(
                    String(openai.baseUrl ?? openai.base_url ?? ""),
                  ),
                  model: normalizeString(String(openai.model ?? "")),
                  apiKey: openai.apiKey ?? openai.api_key as SecretReference | undefined,
                }
              : undefined,
          }
        : undefined,
    },
  };
}

function findWorkspaceConfigPath(startDir: string): string | undefined {
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

function resolveWorkspaceSearchDir(options: ResolveRuntimeConfigOptions): string {
  const cwd = resolve(options.cwd ?? process.cwd());
  if (options.filePath) {
    return dirname(resolveFrom(cwd, options.filePath));
  }
  if (options.workspaceDir) {
    return resolve(options.workspaceDir);
  }
  return cwd;
}

function resolveUserConfigPath(env: NodeJS.ProcessEnv): string | undefined {
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

function resolveSystemConfigPath(): string | undefined {
  const candidate = "/etc/llmthinkrc";
  return existsSync(candidate) ? candidate : undefined;
}

function stateHome(env: NodeJS.ProcessEnv): string {
  const xdgStateHome = normalizeString(env.XDG_STATE_HOME);
  if (xdgStateHome) {
    return resolve(xdgStateHome);
  }
  return join(homedir(), ".local", "state");
}

function datastoreBaseRoot(env: NodeJS.ProcessEnv): string {
  return join(stateHome(env), "llmthink");
}

function hasWorkspaceMarker(dir: string): boolean {
  return WORKSPACE_MARKERS.some((marker) => existsSync(join(dir, marker)));
}

function findWorkspaceDomainRoot(startDir: string): string | undefined {
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

function sanitizeWorkspaceName(dir: string): string {
  const name = basename(dir).trim() || "workspace";
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized || "workspace";
}

function workspaceDomainId(dir: string): string {
  const digest = createHash("sha256").update(dir).digest("hex").slice(0, 12);
  return `${sanitizeWorkspaceName(dir)}-${digest}`;
}

function resolveWorkspaceDomainDir(options: ResolveRuntimeConfigOptions): string {
  const searchDir = resolveWorkspaceSearchDir(options);
  return findWorkspaceDomainRoot(searchDir) ?? searchDir;
}

function loadConfigLayers(options: ResolveRuntimeConfigOptions): {
  workspace: ConfigLayer;
  user: ConfigLayer;
  system: ConfigLayer;
} {
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

function userStorageRoot(env: NodeJS.ProcessEnv): string {
  return join(datastoreBaseRoot(env), "user");
}

function systemStorageRoot(): string {
  return "/var/lib/llmthink/system";
}

function defaultWorkspaceStorageRoot(options: ResolveRuntimeConfigOptions): string {
  const env = options.env ?? process.env;
  const workspaceDir = resolveWorkspaceDomainDir(options);
  return join(datastoreBaseRoot(env), "workspace", workspaceDomainId(workspaceDir));
}

function defaultStorageRootForDomain(
  domain: ConfigDomain,
  options: ResolveRuntimeConfigOptions,
): string {
  const env = options.env ?? process.env;
  if (domain === "workspace") {
    return defaultWorkspaceStorageRoot(options);
  }
  if (domain === "user") {
    return userStorageRoot(env);
  }
  return systemStorageRoot();
}

function resolveConfigStorageRoot(
  layer: ConfigLayer,
  options: ResolveRuntimeConfigOptions,
): string | undefined {
  const thought = layer.config?.thought;
  if (!thought) {
    return undefined;
  }
  if (thought.storagePath) {
    const baseDir = layer.path ? dirname(layer.path) : resolve(options.cwd ?? process.cwd());
    return resolveFrom(baseDir, thought.storagePath);
  }
  if (thought.storageDomain) {
    return defaultStorageRootForDomain(thought.storageDomain, options);
  }
  return undefined;
}

function runCommand(command: string, cwd: string): string {
  const result = process.platform === "win32"
    ? execFileSync("cmd.exe", ["/d", "/s", "/c", command], {
        cwd,
        encoding: "utf8",
      })
    : execFileSync("/bin/sh", ["-c", command], {
        cwd,
        encoding: "utf8",
      });
  return result.trim();
}

function resolveSecretReference(
  secret: SecretReference | undefined,
  layerPath: string | undefined,
  env: NodeJS.ProcessEnv,
): string | undefined {
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
    const secdatSpec =
      typeof secret.secdat === "string"
        ? { key: secret.secdat }
        : secret.secdat;
    const key = normalizeString(secdatSpec.key);
    if (!key) {
      return undefined;
    }
    const args: string[] = [];
    const dir = normalizeString(secdatSpec.dir);
    if (dir) {
      const resolvedDir = layerPath ? resolveFrom(dirname(layerPath), dir) : resolve(dir);
      args.push("--dir", resolvedDir);
    }
    args.push("get", key);
    return normalizeString(
      execFileSync("secdat", args, { encoding: "utf8" }).trim(),
    );
  }
  return undefined;
}

function firstDefined<T>(...values: Array<T | undefined>): T | undefined {
  return values.find((value) => value !== undefined);
}

function firstResolved<T>(
  ...candidates: Array<ResolvedCandidate<T> | undefined>
): ResolvedCandidate<T> | undefined {
  return candidates.find((candidate) => candidate !== undefined);
}

function layerSource(
  layer: ConfigDomain,
  key: string,
  path: string | undefined,
): ResolvedValueSource {
  return { layer, key, path };
}

function inferDomainFromLayer(layer: ConfigDomain): ConfigDomain {
  return layer;
}

function resolveStorageFromLayer(
  layerName: ConfigDomain,
  layer: ConfigLayer,
  options: ResolveRuntimeConfigOptions,
): ResolvedCandidate<ResolvedRuntimeConfig["storage"]> | undefined {
  const thought = layer.config?.thought;
  if (!thought) {
    return undefined;
  }
  if (thought.storagePath) {
    const baseDir = layer.path ? dirname(layer.path) : resolve(options.cwd ?? process.cwd());
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

function resolveStorageDomainSource(
  storageSource: ResolvedValueSource,
  storage: ResolvedRuntimeConfig["storage"],
): ResolvedValueSource {
  if (storageSource.key === "thought.storagePath") {
    return {
      layer: storageSource.layer,
      key: `inferred:${storage.domain}`,
      path: storageSource.path,
    };
  }
  return storageSource;
}

export function resolveThoughtStorageRoot(
  options: ResolveRuntimeConfigOptions = {},
): string {
  return resolveRuntimeConfig(options).storage.root;
}

export function resolveEmbeddingConfig(
  options: ResolveRuntimeConfigOptions = {},
): ResolvedEmbeddingConfig {
  return resolveRuntimeConfig(options).embeddings;
}

export function resolveRuntimeConfig(
  options: ResolveRuntimeConfigOptions = {},
): ResolvedRuntimeConfig {
  const env = options.env ?? process.env;
  const layers = loadConfigLayers(options);
  const envStoragePath = normalizeString(env.LLMTHINK_STORAGE_PATH);
  const envStorageDomain = parseDomain(normalizeString(env.LLMTHINK_STORAGE_DOMAIN));

  const storageResolved =
    firstResolved<ResolvedRuntimeConfig["storage"]>(
      options.storagePath
        ? {
            value: {
              root: resolveFrom(resolve(options.cwd ?? process.cwd()), options.storagePath),
              domain: options.storageDomain ?? "workspace",
            },
            source: { layer: "cli", key: "storagePath" },
          }
        : undefined,
      options.storageDomain
        ? {
            value: {
              root: defaultStorageRootForDomain(options.storageDomain, options),
              domain: options.storageDomain,
            },
            source: { layer: "cli", key: "storageDomain" },
          }
        : undefined,
      resolveStorageFromLayer("workspace", layers.workspace, options),
      resolveStorageFromLayer("user", layers.user, options),
      resolveStorageFromLayer("system", layers.system, options),
      envStoragePath
        ? {
            value: {
              root: resolveFrom(resolve(options.cwd ?? process.cwd()), envStoragePath),
              domain: envStorageDomain ?? "workspace",
            },
            source: { layer: "env", key: "LLMTHINK_STORAGE_PATH" },
          }
        : undefined,
      envStorageDomain
        ? {
            value: {
              root: defaultStorageRootForDomain(envStorageDomain, options),
              domain: envStorageDomain,
            },
            source: { layer: "env", key: "LLMTHINK_STORAGE_DOMAIN" },
          }
        : undefined,
      {
        value: {
          root: defaultWorkspaceStorageRoot(options),
          domain: "workspace",
        },
        source: { layer: "default", key: "workspace-default" },
      },
    )!;
  const storage = storageResolved.value;

  const providerResolved =
    firstResolved<ConfigEmbeddingProvider>(
      layers.workspace.config?.embeddings?.provider
        ? {
            value: layers.workspace.config.embeddings.provider,
            source: layerSource("workspace", "embeddings.provider", layers.workspace.path),
          }
        : undefined,
      layers.user.config?.embeddings?.provider
        ? {
            value: layers.user.config.embeddings.provider,
            source: layerSource("user", "embeddings.provider", layers.user.path),
          }
        : undefined,
      layers.system.config?.embeddings?.provider
        ? {
            value: layers.system.config.embeddings.provider,
            source: layerSource("system", "embeddings.provider", layers.system.path),
          }
        : undefined,
      parseProvider(normalizeString(env.LLMTHINK_EMBEDDING_PROVIDER))
        ? {
            value: parseProvider(normalizeString(env.LLMTHINK_EMBEDDING_PROVIDER))!,
            source: { layer: "env", key: "LLMTHINK_EMBEDDING_PROVIDER" },
          }
        : undefined,
      {
        value: "ollama",
        source: { layer: "default", key: "provider-default" },
      },
    )!;

  const timeoutResolved =
    firstResolved<number>(
      layers.workspace.config?.embeddings?.timeoutMs !== undefined
        ? {
            value: layers.workspace.config.embeddings.timeoutMs,
            source: layerSource("workspace", "embeddings.timeoutMs", layers.workspace.path),
          }
        : undefined,
      layers.user.config?.embeddings?.timeoutMs !== undefined
        ? {
            value: layers.user.config.embeddings.timeoutMs,
            source: layerSource("user", "embeddings.timeoutMs", layers.user.path),
          }
        : undefined,
      layers.system.config?.embeddings?.timeoutMs !== undefined
        ? {
            value: layers.system.config.embeddings.timeoutMs,
            source: layerSource("system", "embeddings.timeoutMs", layers.system.path),
          }
        : undefined,
      parsePositiveNumber(env.LLMTHINK_EMBEDDING_TIMEOUT_MS)
        ? {
            value: parsePositiveNumber(env.LLMTHINK_EMBEDDING_TIMEOUT_MS)!,
            source: { layer: "env", key: "LLMTHINK_EMBEDDING_TIMEOUT_MS" },
          }
        : undefined,
      {
        value: 3000,
        source: { layer: "default", key: "timeout-default" },
      },
    )!;

  const ollamaBaseUrlResolved =
    firstResolved<string>(
      layers.workspace.config?.embeddings?.ollama?.baseUrl
        ? {
            value: trimTrailingSlash(layers.workspace.config.embeddings.ollama.baseUrl),
            source: layerSource("workspace", "embeddings.ollama.baseUrl", layers.workspace.path),
          }
        : undefined,
      layers.user.config?.embeddings?.ollama?.baseUrl
        ? {
            value: trimTrailingSlash(layers.user.config.embeddings.ollama.baseUrl),
            source: layerSource("user", "embeddings.ollama.baseUrl", layers.user.path),
          }
        : undefined,
      layers.system.config?.embeddings?.ollama?.baseUrl
        ? {
            value: trimTrailingSlash(layers.system.config.embeddings.ollama.baseUrl),
            source: layerSource("system", "embeddings.ollama.baseUrl", layers.system.path),
          }
        : undefined,
      normalizeString(env.OLLAMA_BASE_URL)
        ? {
            value: trimTrailingSlash(normalizeString(env.OLLAMA_BASE_URL)!),
            source: { layer: "env", key: "OLLAMA_BASE_URL" },
          }
        : undefined,
      {
        value: "http://127.0.0.1:11434",
        source: { layer: "default", key: "ollama-base-url-default" },
      },
    )!;

  const ollamaModelResolved =
    firstResolved<string>(
      layers.workspace.config?.embeddings?.ollama?.model
        ? {
            value: layers.workspace.config.embeddings.ollama.model,
            source: layerSource("workspace", "embeddings.ollama.model", layers.workspace.path),
          }
        : undefined,
      layers.user.config?.embeddings?.ollama?.model
        ? {
            value: layers.user.config.embeddings.ollama.model,
            source: layerSource("user", "embeddings.ollama.model", layers.user.path),
          }
        : undefined,
      layers.system.config?.embeddings?.ollama?.model
        ? {
            value: layers.system.config.embeddings.ollama.model,
            source: layerSource("system", "embeddings.ollama.model", layers.system.path),
          }
        : undefined,
      normalizeString(env.OLLAMA_EMBED_MODEL)
        ? {
            value: normalizeString(env.OLLAMA_EMBED_MODEL)!,
            source: { layer: "env", key: "OLLAMA_EMBED_MODEL" },
          }
        : undefined,
      {
        value: "nomic-embed-text",
        source: { layer: "default", key: "ollama-model-default" },
      },
    )!;

  const openaiBaseUrlResolved =
    firstResolved<string>(
      layers.workspace.config?.embeddings?.openai?.baseUrl
        ? {
            value: trimTrailingSlash(layers.workspace.config.embeddings.openai.baseUrl),
            source: layerSource("workspace", "embeddings.openai.baseUrl", layers.workspace.path),
          }
        : undefined,
      layers.user.config?.embeddings?.openai?.baseUrl
        ? {
            value: trimTrailingSlash(layers.user.config.embeddings.openai.baseUrl),
            source: layerSource("user", "embeddings.openai.baseUrl", layers.user.path),
          }
        : undefined,
      layers.system.config?.embeddings?.openai?.baseUrl
        ? {
            value: trimTrailingSlash(layers.system.config.embeddings.openai.baseUrl),
            source: layerSource("system", "embeddings.openai.baseUrl", layers.system.path),
          }
        : undefined,
      normalizeString(env.OPENAI_BASE_URL)
        ? {
            value: trimTrailingSlash(normalizeString(env.OPENAI_BASE_URL)!),
            source: { layer: "env", key: "OPENAI_BASE_URL" },
          }
        : undefined,
      {
        value: "https://api.openai.com/v1",
        source: { layer: "default", key: "openai-base-url-default" },
      },
    )!;

  const openaiModelResolved =
    firstResolved<string>(
      layers.workspace.config?.embeddings?.openai?.model
        ? {
            value: layers.workspace.config.embeddings.openai.model,
            source: layerSource("workspace", "embeddings.openai.model", layers.workspace.path),
          }
        : undefined,
      layers.user.config?.embeddings?.openai?.model
        ? {
            value: layers.user.config.embeddings.openai.model,
            source: layerSource("user", "embeddings.openai.model", layers.user.path),
          }
        : undefined,
      layers.system.config?.embeddings?.openai?.model
        ? {
            value: layers.system.config.embeddings.openai.model,
            source: layerSource("system", "embeddings.openai.model", layers.system.path),
          }
        : undefined,
      normalizeString(env.OPENAI_EMBED_MODEL)
        ? {
            value: normalizeString(env.OPENAI_EMBED_MODEL)!,
            source: { layer: "env", key: "OPENAI_EMBED_MODEL" },
          }
        : undefined,
      {
        value: "text-embedding-3-small",
        source: { layer: "default", key: "openai-model-default" },
      },
    )!;

  const openaiApiKeyResolved =
    firstResolved<string>(
      (() => {
        const value = resolveSecretReference(
          layers.workspace.config?.embeddings?.openai?.apiKey,
          layers.workspace.path,
          env,
        );
        return value
          ? {
              value,
              source: layerSource("workspace", "embeddings.openai.apiKey", layers.workspace.path),
            }
          : undefined;
      })(),
      (() => {
        const value = resolveSecretReference(
          layers.user.config?.embeddings?.openai?.apiKey,
          layers.user.path,
          env,
        );
        return value
          ? {
              value,
              source: layerSource("user", "embeddings.openai.apiKey", layers.user.path),
            }
          : undefined;
      })(),
      (() => {
        const value = resolveSecretReference(
          layers.system.config?.embeddings?.openai?.apiKey,
          layers.system.path,
          env,
        );
        return value
          ? {
              value,
              source: layerSource("system", "embeddings.openai.apiKey", layers.system.path),
            }
          : undefined;
      })(),
      normalizeString(env.OPENAI_API_KEY)
        ? {
            value: normalizeString(env.OPENAI_API_KEY)!,
            source: { layer: "env", key: "OPENAI_API_KEY" },
          }
        : undefined,
      {
        value: "",
        source: { layer: "default", key: "openai-api-key-unset" },
      },
    )!;

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