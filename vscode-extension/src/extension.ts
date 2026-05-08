import * as path from "node:path";
import * as vscode from "vscode";
import { getPreviewStrings, resolvePreviewLocale } from "./i18n";
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
  formatThoughtSemanticAuditPairs,
  formatThoughtSemanticAuditSummary,
  formatThoughtSummary,
  getDslSyntaxGuidanceText,
  isDslHelpRequest,
  limitAuditReport,
  parseDslHelpRequest,
  loadThought,
  listThoughts,
  relateThought,
  saveThoughtSemanticAudit,
  searchThoughtRecords,
  type PersistedThoughtAudit,
  type ThoughtReflectionKind,
  type ThoughtSemanticAuditVerdict,
} from "../../dist/index.js";
import type { AuditReport } from "../../dist/index.js";

const DSL_TOOL_NAME = "llmthink-dsl";
const THOUGHT_TOOL_NAME = "llmthink-thought";

interface DslToolInput {
  action?: "audit" | "help";
  dslText?: string;
  documentId?: string;
  thoughtId?: string;
  topic?: string;
  subtopic?: string;
  detail?: "index" | "quick" | "detail";
}

interface ThoughtToolInput {
  action?: "show" | "semantic-audit";
  thoughtId?: string;
  view?:
    | "summary"
    | "draft"
    | "final"
    | "audit"
    | "reflections"
    | "semantic-audit"
    | "semantic-audit-pairs";
  decisionId?: string;
  supportId?: string;
  verdict?: "supported" | "unsupported" | "mixed" | "unknown";
  reason?: string;
  auditId?: string;
  reviewer?: string;
  model?: string;
  auditedAt?: string;
  sourceThoughtId?: string;
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

const SEMANTIC_AUDIT_VERDICT_ITEMS: Array<{
  label: string;
  description: string;
  value: ThoughtSemanticAuditVerdict;
}> = [
  { label: "supported", description: "根拠として支持できる", value: "supported" },
  { label: "unsupported", description: "根拠として支持できない", value: "unsupported" },
  { label: "mixed", description: "一部支持できるが留保がある", value: "mixed" },
  { label: "unknown", description: "現時点では判定保留", value: "unknown" },
];

let lastReport: AuditReport | undefined;
let lastPanel: vscode.WebviewPanel | undefined;

function isDslEditor(editor: vscode.TextEditor | undefined): boolean {
  return editor?.document.languageId === "llmthink";
}

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

async function openPreviewForEditor(editor: vscode.TextEditor): Promise<void> {
  await openPreviewForEditorInColumn(editor, editor.viewColumn);
}

async function openPreviewForEditorBeside(editor: vscode.TextEditor): Promise<void> {
  await openPreviewForEditorInColumn(editor, vscode.ViewColumn.Beside);
}

async function openPreviewForEditorInColumn(
  editor: vscode.TextEditor,
  viewColumn: vscode.ViewColumn | undefined,
): Promise<void> {
  await vscode.commands.executeCommand(
    "vscode.openWith",
    editor.document.uri,
    DSL_PREVIEW_VIEW_TYPE,
    {
      viewColumn,
      preview: false,
    },
  );
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
  const outputReport = limitAuditReport(persisted.report);
  return new vscode.LanguageModelToolResult([
    new vscode.LanguageModelTextPart(
      `${formatPersistedThoughtAudit(persisted)}${formatAuditReportText(persisted.report)}`,
    ),
    vscode.LanguageModelDataPart.json({
      thought_id: persisted.thoughtId,
      id_source: persisted.idSource,
      report: outputReport,
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

async function promptSemanticAuditVerdict(): Promise<
  ThoughtSemanticAuditVerdict | undefined
> {
  const selected = await vscode.window.showQuickPick(SEMANTIC_AUDIT_VERDICT_ITEMS, {
    placeHolder: "semantic audit verdict を選択してください",
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
        report: limitAuditReport(persisted.report),
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

async function saveThoughtSemanticAuditFromPrompt(
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  const defaultThoughtId = editor ? defaultThoughtIdForDocument(editor.document) : undefined;
  const thoughtId = await promptThoughtId(defaultThoughtId);
  if (!thoughtId) {
    return;
  }
  const decisionId = await vscode.window.showInputBox({
    prompt: "decision id を入力してください",
    ignoreFocusOut: true,
  });
  if (!decisionId) {
    return;
  }
  const supportId = await vscode.window.showInputBox({
    prompt: "support id を入力してください",
    ignoreFocusOut: true,
  });
  if (!supportId) {
    return;
  }
  const verdict = await promptSemanticAuditVerdict();
  if (!verdict) {
    return;
  }
  const reason = await vscode.window.showInputBox({
    prompt: "semantic audit reason を入力してください",
    ignoreFocusOut: true,
  });
  if (!reason) {
    return;
  }
  const reviewer = await vscode.window.showInputBox({
    prompt: "reviewer を入力してください (任意)",
    ignoreFocusOut: true,
  });
  const model = await vscode.window.showInputBox({
    prompt: "model を入力してください (任意)",
    ignoreFocusOut: true,
  });

  saveThoughtSemanticAudit(thoughtId, {
    decisionId,
    supportId,
    verdict,
    reason,
    reviewer: reviewer?.trim() || undefined,
    model: model?.trim() || undefined,
  });
  const snapshot = loadThought(thoughtId);
  showTextInOutput(
    outputChannel,
    `LLMThink Thought Semantic Audit: ${thoughtId}`,
    `${formatThoughtSemanticAuditSummary(snapshot)}\n${formatThoughtSemanticAuditPairs(snapshot)}`,
  );
  vscode.window.showInformationMessage(`LLMThink semantic audit 保存完了: ${thoughtId}`);
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
        new vscode.LanguageModelTextPart(
          getDslSyntaxGuidanceText({
            topic: options.input.topic?.trim(),
            subtopic: options.input.subtopic?.trim(),
            detail: options.input.detail,
            channel: "vsix",
          }),
        ),
      ]);
    }

    const providedText = options.input.dslText?.trim();
    if (providedText) {
      if (isDslHelpRequest(providedText)) {
        const request = parseDslHelpRequest(providedText);
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(
            getDslSyntaxGuidanceText({
              topic: request?.topic,
              subtopic: request?.subtopic,
              detail: request?.detail,
              channel: "vsix",
            }),
          ),
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

class ThoughtTool implements vscode.LanguageModelTool<ThoughtToolInput> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ThoughtToolInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    const editor = vscode.window.activeTextEditor;
    const thoughtId = options.input.thoughtId?.trim() || (
      editor ? defaultThoughtIdForDocument(editor.document) : undefined
    );
    if (!thoughtId) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          "thoughtId が指定されておらず、アクティブエディタからも導出できません。thoughtId を指定してください。",
        ),
      ]);
    }

    const action = options.input.action ?? "show";
    if (action === "semantic-audit") {
      if (!options.input.decisionId || !options.input.supportId || !options.input.verdict || !options.input.reason) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(
            "semantic-audit には decisionId, supportId, verdict, reason が必要です。",
          ),
        ]);
      }
      saveThoughtSemanticAudit(thoughtId, {
        auditId: options.input.auditId?.trim(),
        decisionId: options.input.decisionId,
        supportId: options.input.supportId,
        verdict: options.input.verdict,
        reason: options.input.reason,
        reviewer: options.input.reviewer?.trim(),
        model: options.input.model?.trim(),
        auditedAt: options.input.auditedAt?.trim(),
        sourceThoughtId: options.input.sourceThoughtId?.trim(),
      });
      const savedSnapshot = loadThought(thoughtId);
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `${formatThoughtSemanticAuditSummary(savedSnapshot)}\n${formatThoughtSemanticAuditPairs(savedSnapshot)}`,
        ),
      ]);
    }

    if (action !== "show") {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart("Unsupported thought tool action."),
      ]);
    }

    const snapshot = loadThought(thoughtId);
    const view = options.input.view ?? "semantic-audit";
    const text = view === "draft"
      ? snapshot.draftText ?? ""
      : view === "final"
        ? snapshot.finalText ?? ""
        : view === "audit"
          ? snapshot.latestAudit
            ? formatAuditReportText(snapshot.latestAudit)
            : "No audit yet.\n"
          : view === "reflections"
            ? formatThoughtReflections(snapshot.reflections)
            : view === "semantic-audit-pairs"
              ? formatThoughtSemanticAuditPairs(snapshot)
              : view === "semantic-audit"
                ? formatThoughtSemanticAuditSummary(snapshot)
                : formatThoughtSummary(snapshot);

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(text),
    ]);
  }

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ThoughtToolInput>,
  ): vscode.PreparedToolInvocation {
    const thoughtId = options.input.thoughtId?.trim();
    const action = options.input.action ?? "show";
    const view = options.input.view ?? "semantic-audit";
    return {
      invocationMessage: action === "semantic-audit"
        ? thoughtId
          ? `LLMThink で ${thoughtId} に semantic audit を保存しています`
          : "LLMThink で thought に semantic audit を保存しています"
        : thoughtId
          ? `LLMThink で ${thoughtId} の ${view} を表示しています`
          : `LLMThink で thought の ${view} を表示しています`,
    };
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel("LLMThink");
  const subscriptions: vscode.Disposable[] = [outputChannel];
  const previewStrings = getPreviewStrings(resolvePreviewLocale(vscode.env.language));
  const previewStatusItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    10,
  );

  previewStatusItem.name = previewStrings.previewName;
  previewStatusItem.command = "llmthink.dslPreview";
  previewStatusItem.text = `$(open-preview) ${previewStrings.previewButton}`;
  previewStatusItem.tooltip = previewStrings.previewTooltip;

  const updatePreviewStatusItem = (editor: vscode.TextEditor | undefined) => {
    if (isDslEditor(editor)) {
      previewStatusItem.show();
      return;
    }
    previewStatusItem.hide();
  };

  subscriptions.push(
    previewStatusItem,
    DslPreviewEditorProvider.register(context),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      updatePreviewStatusItem(editor);
    }),
  );

  updatePreviewStatusItem(vscode.window.activeTextEditor);

  if (typeof vscode.lm.registerTool === "function") {
    try {
      subscriptions.push(vscode.lm.registerTool(DSL_TOOL_NAME, new DslTool()));
      subscriptions.push(vscode.lm.registerTool(THOUGHT_TOOL_NAME, new ThoughtTool()));
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
            report: limitAuditReport(persisted.report),
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
          previewStrings.previewMissingEditor,
        );
        return;
      }

      await openPreviewForEditor(editor);
    }),
    vscode.commands.registerCommand("llmthink.dslPreviewBeside", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage(
          previewStrings.previewMissingEditor,
        );
        return;
      }

      await openPreviewForEditorBeside(editor);
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
    vscode.commands.registerCommand("llmthink.thoughtSemanticAudit", async () => {
      await saveThoughtSemanticAuditFromPrompt(outputChannel);
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
