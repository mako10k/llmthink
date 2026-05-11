import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import test from "node:test";

import {
  resolveRuntimeConfig,
  resolveEmbeddingConfig,
  resolveThoughtStorageRoot,
} from "../../src/config/runtime.js";

function withTempDir(run: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "llmthink-runtime-"));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function writeExecutable(filePath: string, body: string): void {
  writeFileSync(filePath, body, { mode: 0o755 });
  chmodSync(filePath, 0o755);
}

test("resolveThoughtStorageRoot prefers workspace config over user XDG config", () => {
  withTempDir((dir) => {
    const workspaceDir = join(dir, "workspace", "nested");
    const xdgConfigHome = join(dir, "xdg-config");
    const xdgStateHome = join(dir, "xdg-state");

    mkdirSync(workspaceDir, { recursive: true });
    writeJson(join(dir, "workspace", ".llmthinkrc"), {
      thought: { storageDomain: "workspace" },
    });
    writeJson(join(xdgConfigHome, "llmthink", "config.json"), {
      thought: { storageDomain: "user" },
    });

    const storageRoot = resolveThoughtStorageRoot({
      cwd: workspaceDir,
      env: {
        ...process.env,
        XDG_CONFIG_HOME: xdgConfigHome,
        XDG_STATE_HOME: xdgStateHome,
      },
    });

    assert.equal(storageRoot, join(dir, "workspace", ".llmthink"));
  });
});

test("resolveThoughtStorageRoot uses XDG user defaults when no workspace config exists", () => {
  withTempDir((dir) => {
    const workspaceDir = join(dir, "workspace");
    const xdgConfigHome = join(dir, "xdg-config");
    const xdgStateHome = join(dir, "xdg-state");

    mkdirSync(workspaceDir, { recursive: true });
    writeJson(join(xdgConfigHome, "llmthink", "config.json"), {
      thought: { storageDomain: "user" },
    });

    const storageRoot = resolveThoughtStorageRoot({
      cwd: workspaceDir,
      env: {
        ...process.env,
        XDG_CONFIG_HOME: xdgConfigHome,
        XDG_STATE_HOME: xdgStateHome,
      },
    });

    assert.equal(storageRoot, join(xdgStateHome, "llmthink"));
  });
});

test("resolveThoughtStorageRoot resolves storagePath relative to the selected config file", () => {
  withTempDir((dir) => {
    const configDir = join(dir, "configs", "project");
    const configPath = join(configDir, ".llmthinkrc");

    mkdirSync(join(dir, "workspace"), { recursive: true });
    writeJson(configPath, {
      thought: { storagePath: "state" },
    });

    const storageRoot = resolveThoughtStorageRoot({
      cwd: join(dir, "workspace"),
      configFilePath: relative(join(dir, "workspace"), configPath),
    });

    assert.equal(storageRoot, join(configDir, "state"));
  });
});

test("resolveEmbeddingConfig loads provider and api key from workspace config command", () => {
  withTempDir((dir) => {
    const workspaceDir = join(dir, "workspace");
    const scriptPath = join(workspaceDir, "print-secret.sh");

    mkdirSync(workspaceDir, { recursive: true });
    writeExecutable(scriptPath, "#!/bin/sh\nprintf 'command-secret\\n'\n");
    writeJson(join(workspaceDir, ".llmthinkrc"), {
      embeddings: {
        provider: "openai",
        timeoutMs: 4500,
        openai: {
          model: "text-embedding-3-large",
          apiKey: { command: "./print-secret.sh" },
        },
      },
    });

    const config = resolveEmbeddingConfig({ cwd: workspaceDir });

    assert.equal(config.provider, "openai");
    assert.equal(config.timeoutMs, 4500);
    assert.equal(config.openaiModel, "text-embedding-3-large");
    assert.equal(config.openaiApiKey, "command-secret");
  });
});

test("resolveEmbeddingConfig loads api key via secdat", () => {
  withTempDir((dir) => {
    const workspaceDir = join(dir, "workspace");
    const binDir = join(dir, "bin");
    const secdatPath = join(binDir, "secdat");
    const originalPath = process.env.PATH;

    mkdirSync(workspaceDir, { recursive: true });
    mkdirSync(binDir, { recursive: true });
    writeExecutable(
      secdatPath,
      "#!/bin/sh\nif [ \"$1\" = \"--dir\" ]; then\n  shift\n  shift\nfi\nif [ \"$1\" = \"get\" ] && [ \"$2\" = \"OPENAI_API_KEY\" ]; then\n  printf 'secdat-secret\\n'\n  exit 0\nfi\nexit 1\n",
    );
    writeJson(join(workspaceDir, ".llmthinkrc"), {
      embeddings: {
        provider: "openai",
        openai: {
          apiKey: { secdat: { key: "OPENAI_API_KEY", dir: "./secrets" } },
        },
      },
    });

    process.env.PATH = `${binDir}:${originalPath ?? ""}`;
    try {
      const config = resolveEmbeddingConfig({ cwd: workspaceDir });
      assert.equal(config.openaiApiKey, "secdat-secret");
    } finally {
      process.env.PATH = originalPath;
    }
  });
});

test("resolveRuntimeConfig reports discovered config paths and selected storage domain", () => {
  withTempDir((dir) => {
    const workspaceDir = join(dir, "workspace", "nested");
    const xdgConfigHome = join(dir, "xdg-config");
    const xdgStateHome = join(dir, "xdg-state");

    mkdirSync(workspaceDir, { recursive: true });
    writeJson(join(dir, "workspace", ".llmthinkrc"), {
      thought: { storageDomain: "workspace" },
    });
    writeJson(join(xdgConfigHome, "llmthink", "config.json"), {
      thought: { storageDomain: "user" },
    });

    const runtimeConfig = resolveRuntimeConfig({
      cwd: workspaceDir,
      env: {
        ...process.env,
        XDG_CONFIG_HOME: xdgConfigHome,
        XDG_STATE_HOME: xdgStateHome,
      },
    });

    assert.equal(runtimeConfig.configPaths.workspace, join(dir, "workspace", ".llmthinkrc"));
    assert.equal(runtimeConfig.configPaths.user, join(xdgConfigHome, "llmthink", "config.json"));
    assert.equal(runtimeConfig.storage.domain, "workspace");
    assert.equal(runtimeConfig.storage.root, join(dir, "workspace", ".llmthink"));
    assert.equal(runtimeConfig.sources.storage.root.layer, "workspace");
    assert.equal(runtimeConfig.sources.storage.root.key, "thought.storageDomain");
    assert.equal(runtimeConfig.sources.storage.domain.layer, "workspace");
    assert.equal(runtimeConfig.sources.embeddings.provider.layer, "default");
  });
});

test("resolveRuntimeConfig reports env-backed sources when config files are absent", () => {
  withTempDir((dir) => {
    const workspaceDir = join(dir, "workspace");

    mkdirSync(workspaceDir, { recursive: true });

    const runtimeConfig = resolveRuntimeConfig({
      cwd: workspaceDir,
      env: {
        ...process.env,
        LLMTHINK_STORAGE_DOMAIN: "user",
        LLMTHINK_EMBEDDING_PROVIDER: "openai",
        OPENAI_API_KEY: "env-secret",
      },
    });

    assert.equal(runtimeConfig.storage.domain, "user");
    assert.equal(runtimeConfig.sources.storage.root.layer, "env");
    assert.equal(runtimeConfig.sources.storage.root.key, "LLMTHINK_STORAGE_DOMAIN");
    assert.equal(runtimeConfig.sources.embeddings.provider.layer, "env");
    assert.equal(runtimeConfig.sources.embeddings.provider.key, "LLMTHINK_EMBEDDING_PROVIDER");
    assert.equal(runtimeConfig.sources.embeddings.openaiApiKey.layer, "env");
    assert.equal(runtimeConfig.sources.embeddings.openaiApiKey.key, "OPENAI_API_KEY");
  });
});