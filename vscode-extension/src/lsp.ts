import { access } from "node:fs/promises";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  Trace,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;
const execFileAsync = promisify(execFile);

interface ResolvedServerOption {
  label: string;
  serverOptions: ServerOptions;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function workspaceFoldersByPriority(): vscode.WorkspaceFolder[] {
  const activeDocument = vscode.window.activeTextEditor?.document;
  const activeFolder = activeDocument
    ? vscode.workspace.getWorkspaceFolder(activeDocument.uri)
    : undefined;
  const folders = [...(vscode.workspace.workspaceFolders ?? [])];
  if (!activeFolder) {
    return folders;
  }

  return [activeFolder, ...folders.filter((folder) => folder.uri.toString() !== activeFolder.uri.toString())];
}

async function commandExists(command: string): Promise<boolean> {
  const resolver = process.platform === "win32" ? "where" : "which";
  try {
    await execFileAsync(resolver, [command]);
    return true;
  } catch {
    return false;
  }
}

function bundledServerPath(context: vscode.ExtensionContext): string {
  return path.join(context.extensionPath, "dist", "llmthink-lsp.js");
}

function configuredServerOptions(configuredPath: string): ServerOptions {
  const isJavaScriptEntry = path.extname(configuredPath) === ".js";
  return {
    command: isJavaScriptEntry ? process.execPath : configuredPath,
    args: isJavaScriptEntry ? [configuredPath, "--stdio"] : ["--stdio"],
    transport: TransportKind.stdio,
  };
}

async function resolveServerCandidates(
  context: vscode.ExtensionContext,
): Promise<ResolvedServerOption[]> {
  const candidates: ResolvedServerOption[] = [];
  const configuration = vscode.workspace.getConfiguration("llmthink");
  const configuredPath = configuration.get<string>("languageServer.path")?.trim();
  for (const folder of workspaceFoldersByPriority()) {
    const candidate = path.join(folder.uri.fsPath, "build", "llmthink-lsp.js");
    if (await fileExists(candidate)) {
      candidates.push({
        label: `workspace build (${folder.name})`,
        serverOptions: {
          command: process.execPath,
          args: [candidate, "--stdio"],
          transport: TransportKind.stdio,
        },
      });
      break;
    }
  }

  if (await commandExists("llmthink-lsp")) {
    candidates.push({
      label: "PATH command (llmthink-lsp)",
      serverOptions: {
        command: "llmthink-lsp",
        args: ["--stdio"],
        transport: TransportKind.stdio,
      },
    });
  }

  if (configuredPath) {
    if (path.isAbsolute(configuredPath)) {
      if (await fileExists(configuredPath)) {
        candidates.push({
          label: `configured path (${configuredPath})`,
          serverOptions: configuredServerOptions(configuredPath),
        });
      }
    } else if (await commandExists(configuredPath)) {
      candidates.push({
        label: `configured command (${configuredPath})`,
        serverOptions: configuredServerOptions(configuredPath),
      });
    }
  }

  const bundledPath = bundledServerPath(context);
  if (await fileExists(bundledPath)) {
    candidates.push({
      label: "bundled fallback",
      serverOptions: {
        command: process.execPath,
        args: [bundledPath, "--stdio"],
        transport: TransportKind.stdio,
      },
    });
  }

  return candidates;
}

function isMissingCommandError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const errnoError = error as NodeJS.ErrnoException;
  return errnoError.code === "ENOENT" || /ENOENT|not found/i.test(error.message);
}

async function startResolvedClient(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel,
): Promise<LanguageClient> {
  const candidates = await resolveServerCandidates(context);
  if (candidates.length === 0) {
    throw new Error("No LLMThink language server candidate could be resolved.");
  }

  const failures: string[] = [];
  for (const candidate of candidates) {
    const resolvedClient = new LanguageClient(
      "llmthinkLanguageServer",
      "LLMThink Language Server",
      candidate.serverOptions,
      {
        documentSelector: [{ language: "llmthink" }],
        outputChannel,
      },
    );
    resolvedClient.setTrace(Trace.Off);

    try {
      await resolvedClient.start();
      outputChannel.appendLine(`LLMThink LSP connected via ${candidate.label}.`);
      return resolvedClient;
    } catch (error) {
      await resolvedClient.stop().catch(() => undefined);
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${candidate.label}: ${message}`);
      if (!isMissingCommandError(error)) {
        throw new Error(`Failed to start LLMThink language server via ${candidate.label}: ${message}`);
      }
    }
  }

  throw new Error(`Failed to resolve an LLMThink language server. ${failures.join(" | ")}`);
}

function registerClientLifecycle(
  context: vscode.ExtensionContext,
  activeClient: LanguageClient,
): void {
  context.subscriptions.push({
    dispose: () => {
      if (client === activeClient) {
        void stopLspClient();
      }
    },
  });
}

export async function startLspClient(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  if (client) {
    return;
  }

  client = await startResolvedClient(context, outputChannel);
  registerClientLifecycle(context, client);
}

export async function stopLspClient(): Promise<void> {
  if (!client) {
    return;
  }
  const current = client;
  client = undefined;
  await current.stop();
}

export async function restartLspClient(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  await stopLspClient();
  await startLspClient(context, outputChannel);
}