import { access } from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  Trace,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;

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

async function resolveServerOptions(): Promise<ServerOptions> {
  const configuration = vscode.workspace.getConfiguration("llmthink");
  const configuredPath = configuration.get<string>("languageServer.path")?.trim();
  if (configuredPath) {
    const isJavaScriptEntry = path.extname(configuredPath) === ".js";
    return {
      command: isJavaScriptEntry ? process.execPath : configuredPath,
      args: isJavaScriptEntry ? [configuredPath, "--stdio"] : ["--stdio"],
      transport: TransportKind.stdio,
    };
  }

  for (const folder of workspaceFoldersByPriority()) {
    const candidate = path.join(folder.uri.fsPath, "build", "llmthink-lsp.js");
    if (await fileExists(candidate)) {
      return {
        command: process.execPath,
        args: [candidate, "--stdio"],
        transport: TransportKind.stdio,
      };
    }
  }

  return {
    command: "llmthink-lsp",
    args: ["--stdio"],
    transport: TransportKind.stdio,
  };
}

export async function startLspClient(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  if (client) {
    return;
  }

  const serverOptions = await resolveServerOptions();
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ language: "llmthink" }],
    outputChannel,
  };

  client = new LanguageClient(
    "llmthinkLanguageServer",
    "LLMThink Language Server",
    serverOptions,
    clientOptions,
  );
  client.setTrace(Trace.Off);
  context.subscriptions.push({ dispose: () => void stopLspClient() });
  await client.start();
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