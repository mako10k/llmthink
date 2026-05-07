import * as path from "node:path";
import * as vscode from "vscode";
import { restartLspClient, startLspClient, stopLspClient } from "./lsp";
import { DSL_PREVIEW_VIEW_TYPE, DslPreviewEditorProvider } from "./preview-editor";
import {
  addThoughtReflection,
  auditAndPersistThought,
  deleteThought,
  deriveThoughtIdFromDocumentId,
  deriveThoughtIdFromFilePath,
  draftThought,
  finalizeThought,
  formatAuditReportHtml,
  formatAuditReportText,
  formatPersistedThoughtAudit,
  formatThoughtHistory,
  formatThoughtList,
  formatThoughtReflections,
  formatThoughtSearchResults,
  formatThoughtSummary,
  getDslSyntaxGuidanceText,
  isDslHelpRequest,
  loadThought,
  listThoughts,
  relateThought,
  searchThoughtRecords,
  type PersistedThoughtAudit,
  type ThoughtReflectionKind,
} from "llmthink";
import type { AuditReport } from "llmthink";

const DSL_TOOL_NAME = "llmthink-dsl";

interface DslToolInput {
  action?: "audit" | "help";
  dslText?: string;
  documentId?: string;
  thoughtId?: string;
}

const REFLECTION_KIND_ITEMS: Array<{
  label: string;
  description: string;
  value: ThoughtReflectionKind;
}> = [
  { label: "note", description: "補足メモ", value: "note" },
  { label: "concern", description: "懸念点", value: "concern" },
  { label: "decision", description: "小さな判断", value: "decision" },
  { label: "follow_up", description: "後続アクション", value: "follow_up" },
  {
    label: "audit_response",
    description: "監査結果への応答",
    value: "audit_response",
  },
];

let lastReport: AuditReport | undefined;
let lastPanel: vscode.WebviewPanel | undefined;

function buildPanelHtml(report: AuditReport): string {
  return formatAuditReportHtml(report);
}

function showReportPanel(
  context: vscode.ExtensionContext,
  report: AuditReport,
): void {
  if (!lastPanel) {
    lastPanel = vscode.window.createWebviewPanel(
      "llmthinkAuditReport",
      "LLMThink Audit Report",
      vscode.ViewColumn.Beside,
      {
        enableScripts: false,
        retainContextWhenHidden: true,
      },
    );
    lastPanel.onDidDispose(
      () => {
        lastPanel = undefined;
      },
      undefined,
      context.subscriptions,
    );
  } else {
    lastPanel.reveal(vscode.ViewColumn.Beside);
  }

  lastPanel.title = `LLMThink Audit: ${report.document_id}`;
  lastPanel.webview.html = buildPanelHtml(report);
}

function toDocumentId(document: vscode.TextDocument): string {
  const baseName = path.basename(document.fileName || document.uri.path);
  return baseName.replace(/\.dsl$/i, "") || "active-document";
}

function defaultThoughtIdForDocument(document: vscode.TextDocument): string {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (document.uri.scheme === "file" && document.fileName) {
    return deriveThoughtIdFromFilePath(
      document.fileName,
      workspaceFolder?.uri.fsPath,
    );
  }
  return deriveThoughtIdFromDocumentId(toDocumentId(document));
}

function renderToolResult(
  persisted: PersistedThoughtAudit,
): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([
    new vscode.LanguageModelTextPart(
      `${formatPersistedThoughtAudit(persisted)}${formatAuditReportText(persisted.report)}`,
    ),
    vscode.LanguageModelDataPart.json({
      thought_id: persisted.thoughtId,
      id_source: persisted.idSource,
      report: persisted.report,
    }),
  ]);
}

async function promptThoughtId(
  defaultValue?: string,
): Promise<string | undefined> {
  return vscode.window.showInputBox({
    prompt: "thought-id を入力してください",
    value: defaultValue,
    ignoreFocusOut: true,
  });
}

async function promptSearchQuery(): Promise<string | undefined> {
  return vscode.window.showInputBox({
    prompt: "検索クエリを入力してください",
    ignoreFocusOut: true,
  });
}

async function promptIncludeReflections(): Promise<boolean> {
  const selected = await vscode.window.showQuickPick(
    [
      {
        label: "No",
        description: "draft/final のみを検索する",
        value: false,
      },
      {
        label: "Yes",
        description: "reflect も検索対象に含める",
        value: true,
      },
    ],
    {
      placeHolder: "reflect を検索対象に含めますか?",
      ignoreFocusOut: true,
    },
  );
  return selected?.value ?? false;
}

async function promptReflectionKind(): Promise<
  ThoughtReflectionKind | undefined
> {
  const selected = await vscode.window.showQuickPick(REFLECTION_KIND_ITEMS, {
    placeHolder: "reflect kind を選択してください",
    ignoreFocusOut: true,
  });
  return selected?.value;
}

function showTextInOutput(
  outputChannel: vscode.OutputChannel,
  title: string,
  text: string,
): void {
  outputChannel.clear();
  outputChannel.appendLine(title);
  outputChannel.appendLine("");
  outputChannel.append(text);
  outputChannel.show(true);
}

async function saveActiveDocumentAsDraft(
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage(
      "保存対象のアクティブエディタがありません。",
    );
    return;
  }
  const thoughtId = await promptThoughtId(toDocumentId(editor.document));
  if (!thoughtId) {
    return;
  }
  draftThought(thoughtId, editor.document.getText());
  showTextInOutput(
    outputChannel,
    `LLMThink Thought Draft: ${thoughtId}`,
    formatThoughtSummary(loadThought(thoughtId)),
  );
  vscode.window.showInformationMessage(`LLMThink draft 保存完了: ${thoughtId}`);
}

async function auditThoughtFromActiveDocument(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage(
      "監査対象のアクティブエディタがありません。",
    );
    return;
  }
  const thoughtId = await promptThoughtId(defaultThoughtIdForDocument(editor.document));
  if (!thoughtId) {
    return;
  }
  const persisted = await runRegisteredAudit(editor.document.getText(), {
    thoughtId,
  });

  outputChannel.clear();
  outputChannel.append(formatPersistedThoughtAudit(persisted));
  outputChannel.appendLine(formatAuditReportText(persisted.report));
  outputChannel.appendLine(
    JSON.stringify(
      {
        thought_id: persisted.thoughtId,
        id_source: persisted.idSource,
        report: persisted.report,
      },
      null,
      2,
    ),
  );
  outputChannel.show(true);
  showReportPanel(context, persisted.report);
  vscode.window.showInformationMessage(
    `LLMThink thought 監査完了: ${persisted.thoughtId}`,
  );
}

async function finalizeThoughtFromActiveDocument(
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage(
      "finalize 対象のアクティブエディタがありません。",
    );
    return;
  }
  const thoughtId = await promptThoughtId(defaultThoughtIdForDocument(editor.document));
  if (!thoughtId) {
    return;
  }
  draftThought(thoughtId, editor.document.getText());
  finalizeThought(thoughtId, editor.document.getText());
  showTextInOutput(
    outputChannel,
    `LLMThink Thought Finalized: ${thoughtId}`,
    formatThoughtSummary(loadThought(thoughtId)),
  );
  vscode.window.showInformationMessage(`LLMThink final 保存完了: ${thoughtId}`);
}

async function showThoughtHistoryInOutput(
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  const thoughtId = await promptThoughtId();
  if (!thoughtId) {
    return;
  }
  const snapshot = loadThought(thoughtId);
  showTextInOutput(
    outputChannel,
    `LLMThink Thought History: ${thoughtId}`,
    formatThoughtHistory(snapshot.history),
  );
}

async function searchThoughtsInOutput(
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  const query = await promptSearchQuery();
  if (!query) {
    return;
  }
  const includeReflections = await promptIncludeReflections();
  const results = await searchThoughtRecords(query, undefined, {
    includeReflections,
  });
  showTextInOutput(
    outputChannel,
    `LLMThink Thought Search: ${query} (include reflections: ${includeReflections ? "yes" : "no"})`,
    formatThoughtSearchResults(results),
  );
}

async function listThoughtsInOutput(
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  showTextInOutput(
    outputChannel,
    "LLMThink Thought List",
    formatThoughtList(listThoughts()),
  );
}

async function createRelatedThoughtFromPrompt(
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  const sourceThoughtId = await vscode.window.showInputBox({
    prompt: "元になる thought-id を入力してください",
    ignoreFocusOut: true,
  });
  if (!sourceThoughtId) {
    return;
  }
  const newThoughtId = await promptThoughtId(`${sourceThoughtId}-related`);
  if (!newThoughtId) {
    return;
  }
  relateThought(newThoughtId, sourceThoughtId);
  showTextInOutput(
    outputChannel,
    `LLMThink Related Thought: ${newThoughtId}`,
    formatThoughtSummary(loadThought(newThoughtId)),
  );
  vscode.window.showInformationMessage(
    `LLMThink related thought 作成完了: ${newThoughtId}`,
  );
}

async function addThoughtReflectionFromPrompt(
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  const thoughtId = await promptThoughtId();
  if (!thoughtId) {
    return;
  }
  const kind = await promptReflectionKind();
  if (!kind) {
    return;
  }
  const text = await vscode.window.showInputBox({
    prompt: "reflect 内容を入力してください",
    ignoreFocusOut: true,
  });
  if (!text) {
    return;
  }
  addThoughtReflection(thoughtId, text, kind);
  showTextInOutput(
    outputChannel,
    `LLMThink Thought Reflect: ${thoughtId}`,
    formatThoughtSummary(loadThought(thoughtId)),
  );
  vscode.window.showInformationMessage(
    `LLMThink reflect 保存完了: ${thoughtId}`,
  );
}

async function showThoughtReflectionsInOutput(
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  const thoughtId = await promptThoughtId();
  if (!thoughtId) {
    return;
  }
  const snapshot = loadThought(thoughtId);
  showTextInOutput(
    outputChannel,
    `LLMThink Thought Reflections: ${thoughtId}`,
    formatThoughtReflections(snapshot.reflections),
  );
}

async function deleteThoughtFromPrompt(
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  const thoughtId = await promptThoughtId();
  if (!thoughtId) {
    return;
  }
  const confirmed = await vscode.window.showWarningMessage(
    `thought ${thoughtId} を削除します。取り消しできません。`,
    { modal: true },
    "Delete",
  );
  if (confirmed !== "Delete") {
    return;
  }
  if (!deleteThought(thoughtId)) {
    vscode.window.showWarningMessage(`thought が見つかりません: ${thoughtId}`);
    return;
  }
  showTextInOutput(outputChannel, "LLMThink Thought Delete", `Deleted thought: ${thoughtId}\n`);
  vscode.window.showInformationMessage(`LLMThink thought 削除完了: ${thoughtId}`);
}

async function runRegisteredAudit(
  text: string,
  input: { thoughtId?: string; documentId?: string },
) {
  const persisted = await auditAndPersistThought({
    dslText: text,
    thoughtId: input.thoughtId,
    documentId: input.documentId,
  });
  lastReport = persisted.report;
  return persisted;
}

class DslTool implements vscode.LanguageModelTool<DslToolInput> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<DslToolInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    if (options.input.action === "help") {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(getDslSyntaxGuidanceText()),
      ]);
    }

    const providedText = options.input.dslText?.trim();
    if (providedText) {
      if (isDslHelpRequest(providedText)) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(getDslSyntaxGuidanceText()),
        ]);
      }
      const persisted = await runRegisteredAudit(providedText, {
        thoughtId: options.input.thoughtId?.trim(),
        documentId: options.input.documentId?.trim(),
      });
      return renderToolResult(persisted);
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          "監査対象テキストが渡されておらず、アクティブエディタもありません。dslText を指定してください。",
        ),
      ]);
    }

    const persisted = await runRegisteredAudit(editor.document.getText(), {
      thoughtId:
        options.input.thoughtId?.trim() || defaultThoughtIdForDocument(editor.document),
      documentId: options.input.documentId?.trim() || toDocumentId(editor.document),
    });
    return renderToolResult(persisted);
  }

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<DslToolInput>,
  ): vscode.PreparedToolInvocation {
    const documentId = options.input.documentId?.trim();
    const thoughtId = options.input.thoughtId?.trim();
    return {
      invocationMessage: thoughtId
        ? `LLMThink で ${thoughtId} を再監査して保存しています`
        : documentId
          ? `LLMThink で ${documentId} を監査して保存しています`
          : "LLMThink で DSL を監査して保存しています",
    };
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel("LLMThink");
  const subscriptions: vscode.Disposable[] = [outputChannel];

  subscriptions.push(DslPreviewEditorProvider.register(context));

  if (typeof vscode.lm.registerTool === "function") {
    try {
      subscriptions.push(vscode.lm.registerTool(DSL_TOOL_NAME, new DslTool()));
    } catch (error) {
      outputChannel.appendLine(
        `Failed to register LLMThink language model tool: ${String(error)}`,
      );
    }
  } else {
    outputChannel.appendLine(
      "LLMThink language model tools are unavailable in this VS Code runtime.",
    );
  }

  void startLspClient(context, outputChannel).catch((error: unknown) => {
    outputChannel.appendLine(`Failed to start LLMThink language server: ${String(error)}`);
    outputChannel.show(true);
    void vscode.window.showWarningMessage(
      "LLMThink language server を開始できませんでした。build/llmthink-lsp.js または PATH 上の llmthink-lsp を確認してください。",
    );
  });

  context.subscriptions.push(
    ...subscriptions,
    vscode.commands.registerCommand("llmthink.dslAudit", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage(
          "監査対象のアクティブエディタがありません。",
        );
        return;
      }

      const document = editor.document;
      const persisted = await runRegisteredAudit(document.getText(), {
        thoughtId: defaultThoughtIdForDocument(document),
        documentId: toDocumentId(document),
      });

      outputChannel.clear();
      outputChannel.append(formatPersistedThoughtAudit(persisted));
      outputChannel.appendLine(formatAuditReportText(persisted.report));
      outputChannel.appendLine(
        JSON.stringify(
          {
            thought_id: persisted.thoughtId,
            id_source: persisted.idSource,
            report: persisted.report,
          },
          null,
          2,
        ),
      );
      outputChannel.show(true);

      showReportPanel(context, persisted.report);
      vscode.window.showInformationMessage(
        `LLMThink 監査完了: ${persisted.thoughtId}`,
      );
    }),
    vscode.commands.registerCommand("llmthink.dslReportShow", async () => {
      if (!lastReport) {
        vscode.window.showInformationMessage("まだ監査結果がありません。");
        return;
      }
      showReportPanel(context, lastReport);
      outputChannel.show(true);
    }),
    vscode.commands.registerCommand("llmthink.dslPreview", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage(
          "プレビュー対象のアクティブエディタがありません。",
        );
        return;
      }

      await vscode.commands.executeCommand(
        "vscode.openWith",
        editor.document.uri,
        DSL_PREVIEW_VIEW_TYPE,
        {
          viewColumn: vscode.ViewColumn.Beside,
          preview: true,
        },
      );
    }),
    vscode.commands.registerCommand("llmthink.thoughtDraft", async () => {
      await saveActiveDocumentAsDraft(outputChannel);
    }),
    vscode.commands.registerCommand("llmthink.thoughtRelate", async () => {
      await createRelatedThoughtFromPrompt(outputChannel);
    }),
    vscode.commands.registerCommand("llmthink.thoughtAudit", async () => {
      await auditThoughtFromActiveDocument(context, outputChannel);
    }),
    vscode.commands.registerCommand("llmthink.thoughtFinalize", async () => {
      await finalizeThoughtFromActiveDocument(outputChannel);
    }),
    vscode.commands.registerCommand("llmthink.thoughtReflect", async () => {
      await addThoughtReflectionFromPrompt(outputChannel);
    }),
    vscode.commands.registerCommand("llmthink.thoughtReflections", async () => {
      await showThoughtReflectionsInOutput(outputChannel);
    }),
    vscode.commands.registerCommand("llmthink.thoughtHistory", async () => {
      await showThoughtHistoryInOutput(outputChannel);
    }),
    vscode.commands.registerCommand("llmthink.thoughtSearch", async () => {
      await searchThoughtsInOutput(outputChannel);
    }),
    vscode.commands.registerCommand("llmthink.thoughtList", async () => {
      await listThoughtsInOutput(outputChannel);
    }),
    vscode.commands.registerCommand("llmthink.thoughtDelete", async () => {
      await deleteThoughtFromPrompt(outputChannel);
    }),
    vscode.commands.registerCommand("llmthink.lsp.restart", async () => {
      await restartLspClient(context, outputChannel);
      vscode.window.showInformationMessage(
        "LLMThink language server を再起動しました。",
      );
    }),
  );
}

export async function deactivate(): Promise<void> {
  await stopLspClient();
}
