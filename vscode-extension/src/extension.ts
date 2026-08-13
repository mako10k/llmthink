import * as path from "node:path";
import * as vscode from "vscode";
import { loadLlmthinkCore } from "./core-runtime";
import { getPreviewStrings, resolvePreviewLocale } from "./i18n";
import { restartLspClient, startLspClient, stopLspClient } from "./lsp";
import {
  DSL_PREVIEW_VIEW_TYPE,
  DslPreviewEditorProvider,
} from "./preview-editor";
import {
  addThoughtReflection,
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
  limitAuditReport,
  resolveThoughtStorageRoot,
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
let extensionContext: vscode.ExtensionContext | undefined;

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
  {
    label: "supported",
    description: "根拠として支持できる",
    value: "supported",
  },
  {
    label: "unsupported",
    description: "根拠として支持できない",
    value: "unsupported",
  },
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

async function openPreviewForEditorBeside(
  editor: vscode.TextEditor,
): Promise<void> {
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

function resolveThoughtBaseDir(
  document?: vscode.TextDocument,
): string | undefined {
  const activeDocument = document ?? vscode.window.activeTextEditor?.document;
  const workspaceFolder = activeDocument
    ? vscode.workspace.getWorkspaceFolder(activeDocument.uri)
    : undefined;

  return [
    workspaceFolder?.uri.fsPath,
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    extensionContext?.storageUri?.fsPath,
    extensionContext?.globalStorageUri?.fsPath,
  ].find((candidate) => candidate !== undefined);
}

function resolveThoughtStorageLocation(document?: vscode.TextDocument) {
  return {
    storageRoot: resolveThoughtStorageRoot({
      workspaceDir: resolveThoughtBaseDir(document),
      filePath: document?.uri.scheme === "file" ? document.fileName : undefined,
    }),
  };
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
  const selected = await vscode.window.showQuickPick(
    SEMANTIC_AUDIT_VERDICT_ITEMS,
    {
      placeHolder: "semantic audit verdict を選択してください",
      ignoreFocusOut: true,
    },
  );
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
  const location = resolveThoughtStorageLocation(editor.document);
  draftThought(thoughtId, editor.document.getText(), location);
  showTextInOutput(
    outputChannel,
    `LLMThink Thought Draft: ${thoughtId}`,
    formatThoughtSummary(loadThought(thoughtId, location)),
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
  const thoughtId = await promptThoughtId(
    defaultThoughtIdForDocument(editor.document),
  );
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
  const thoughtId = await promptThoughtId(
    defaultThoughtIdForDocument(editor.document),
  );
  if (!thoughtId) {
    return;
  }
  const location = resolveThoughtStorageLocation(editor.document);
  draftThought(thoughtId, editor.document.getText(), location);
  finalizeThought(thoughtId, editor.document.getText(), location);
  showTextInOutput(
    outputChannel,
    `LLMThink Thought Finalized: ${thoughtId}`,
    formatThoughtSummary(loadThought(thoughtId, location)),
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
  const snapshot = loadThought(thoughtId, resolveThoughtStorageLocation());
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
  const results = await searchThoughtRecords(
    query,
    resolveThoughtStorageLocation(),
    {
      includeReflections,
    },
  );
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
    formatThoughtList(listThoughts(resolveThoughtStorageLocation())),
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
  const location = resolveThoughtStorageLocation();
  relateThought(newThoughtId, sourceThoughtId, location);
  showTextInOutput(
    outputChannel,
    `LLMThink Related Thought: ${newThoughtId}`,
    formatThoughtSummary(loadThought(newThoughtId, location)),
  );
  vscode.window.showInformationMessage(
    `LLMThink related thought 作成完了: ${newThoughtId}`,
  );
}

async function addThoughtReflectionFromPrompt(
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
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
  const location = resolveThoughtStorageLocation(editor?.document);
  addThoughtReflection(thoughtId, text, kind, location);
  showTextInOutput(
    outputChannel,
    `LLMThink Thought Reflect: ${thoughtId}`,
    formatThoughtSummary(loadThought(thoughtId, location)),
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
  const snapshot = loadThought(thoughtId, resolveThoughtStorageLocation());
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
  const defaultThoughtId = editor
    ? defaultThoughtIdForDocument(editor.document)
    : undefined;
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

  const location = resolveThoughtStorageLocation(editor?.document);
  saveThoughtSemanticAudit(
    thoughtId,
    {
      decisionId,
      supportId,
      verdict,
      reason,
      reviewer: reviewer?.trim() || undefined,
      model: model?.trim() || undefined,
    },
    location,
  );
  const snapshot = loadThought(thoughtId, location);
  showTextInOutput(
    outputChannel,
    `LLMThink Thought Semantic Audit: ${thoughtId}`,
    `${formatThoughtSemanticAuditSummary(snapshot)}\n${formatThoughtSemanticAuditPairs(snapshot)}`,
  );
  vscode.window.showInformationMessage(
    `LLMThink semantic audit 保存完了: ${thoughtId}`,
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
  if (!deleteThought(thoughtId, resolveThoughtStorageLocation())) {
    vscode.window.showWarningMessage(`thought が見つかりません: ${thoughtId}`);
    return;
  }
  showTextInOutput(
    outputChannel,
    "LLMThink Thought Delete",
    `Deleted thought: ${thoughtId}\n`,
  );
  vscode.window.showInformationMessage(
    `LLMThink thought 削除完了: ${thoughtId}`,
  );
}

async function runRegisteredAudit(
  text: string,
  input: {
    thoughtId?: string;
    documentId?: string;
    document?: vscode.TextDocument;
  },
) {
  const baseDir = resolveThoughtBaseDir(input.document);
  const core = await loadLlmthinkCore(baseDir);
  const persisted = await core.auditAndPersistThought(
    {
      dslText: text,
      thoughtId: input.thoughtId,
      documentId: input.documentId,
    },
    {
      fileBaseDir: baseDir,
      storageRoot: resolveThoughtStorageLocation(input.document).storageRoot,
    },
  );
  lastReport = persisted.report;
  return persisted;
}

type LoadedCore = Awaited<ReturnType<typeof loadLlmthinkCore>>;

function textToolResult(text: string): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([
    new vscode.LanguageModelTextPart(text),
  ]);
}

function dslHelpResult(
  core: LoadedCore,
  input: DslToolInput,
): vscode.LanguageModelToolResult {
  return textToolResult(
    core.getDslSyntaxGuidanceText({
      topic: input.topic?.trim(),
      subtopic: input.subtopic?.trim(),
      detail: input.detail,
      channel: "vsix",
    }),
  );
}

async function invokeProvidedDslText(
  core: LoadedCore,
  input: DslToolInput,
  providedText: string,
  activeDocument: vscode.TextDocument | undefined,
): Promise<vscode.LanguageModelToolResult> {
  if (core.isDslHelpRequest(providedText)) {
    const request = core.parseDslHelpRequest(providedText);
    return dslHelpResult(core, { ...input, ...request });
  }
  const persisted = await runRegisteredAudit(providedText, {
    thoughtId: input.thoughtId?.trim(),
    documentId: input.documentId?.trim(),
    document: activeDocument,
  });
  return renderToolResult(persisted);
}

function dslInvocationMessage(input: DslToolInput): string {
  const thoughtId = input.thoughtId?.trim();
  if (thoughtId) {
    return `LLMThink で ${thoughtId} を再監査して保存しています`;
  }
  const documentId = input.documentId?.trim();
  return documentId
    ? `LLMThink で ${documentId} を監査して保存しています`
    : "LLMThink で DSL を監査して保存しています";
}

function resolveThoughtToolId(
  input: ThoughtToolInput,
  editor: vscode.TextEditor | undefined,
): string | undefined {
  const explicitId = input.thoughtId?.trim();
  if (explicitId) {
    return explicitId;
  }
  return editor ? defaultThoughtIdForDocument(editor.document) : undefined;
}

function semanticAuditToolResult(
  thoughtId: string,
  input: ThoughtToolInput,
  document: vscode.TextDocument | undefined,
): vscode.LanguageModelToolResult {
  if (
    !input.decisionId ||
    !input.supportId ||
    !input.verdict ||
    !input.reason
  ) {
    return textToolResult(
      "semantic-audit には decisionId, supportId, verdict, reason が必要です。",
    );
  }
  const storage = resolveThoughtStorageLocation(document);
  saveThoughtSemanticAudit(
    thoughtId,
    {
      auditId: input.auditId?.trim(),
      decisionId: input.decisionId,
      supportId: input.supportId,
      verdict: input.verdict,
      reason: input.reason,
      reviewer: input.reviewer?.trim(),
      model: input.model?.trim(),
      auditedAt: input.auditedAt?.trim(),
      sourceThoughtId: input.sourceThoughtId?.trim(),
    },
    storage,
  );
  const snapshot = loadThought(thoughtId, storage);
  return textToolResult(
    `${formatThoughtSemanticAuditSummary(snapshot)}\n${formatThoughtSemanticAuditPairs(snapshot)}`,
  );
}

type LoadedThought = ReturnType<typeof loadThought>;

function renderThoughtToolView(
  snapshot: LoadedThought,
  view: ThoughtToolInput["view"],
): string {
  switch (view) {
    case "draft":
      return snapshot.draftText ?? "";
    case "final":
      return snapshot.finalText ?? "";
    case "audit":
      return snapshot.latestAudit
        ? formatAuditReportText(snapshot.latestAudit)
        : "No audit yet.\n";
    case "reflections":
      return formatThoughtReflections(snapshot.reflections);
    case "semantic-audit-pairs":
      return formatThoughtSemanticAuditPairs(snapshot);
    case "semantic-audit":
      return formatThoughtSemanticAuditSummary(snapshot);
    default:
      return formatThoughtSummary(snapshot);
  }
}

function thoughtInvocationMessage(input: ThoughtToolInput): string {
  const thoughtId = input.thoughtId?.trim();
  if (input.action === "semantic-audit") {
    return thoughtId
      ? `LLMThink で ${thoughtId} に semantic audit を保存しています`
      : "LLMThink で thought に semantic audit を保存しています";
  }
  const subject = thoughtId ?? "thought";
  return `LLMThink で ${subject} の ${input.view ?? "semantic-audit"} を表示しています`;
}

class DslTool implements vscode.LanguageModelTool<DslToolInput> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<DslToolInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    const activeDocument = vscode.window.activeTextEditor?.document;
    const core = await loadLlmthinkCore(resolveThoughtBaseDir(activeDocument));

    if (options.input.action === "help") {
      return dslHelpResult(core, options.input);
    }

    const providedText = options.input.dslText?.trim();
    if (providedText) {
      return invokeProvidedDslText(
        core,
        options.input,
        providedText,
        activeDocument,
      );
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return textToolResult(
        "監査対象テキストが渡されておらず、アクティブエディタもありません。dslText を指定してください。",
      );
    }

    const persisted = await runRegisteredAudit(editor.document.getText(), {
      thoughtId:
        options.input.thoughtId?.trim() ||
        defaultThoughtIdForDocument(editor.document),
      documentId:
        options.input.documentId?.trim() || toDocumentId(editor.document),
      document: editor.document,
    });
    return renderToolResult(persisted);
  }

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<DslToolInput>,
  ): vscode.PreparedToolInvocation {
    return {
      invocationMessage: dslInvocationMessage(options.input),
    };
  }
}

class ThoughtTool implements vscode.LanguageModelTool<ThoughtToolInput> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ThoughtToolInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    const editor = vscode.window.activeTextEditor;
    const thoughtId = resolveThoughtToolId(options.input, editor);
    if (!thoughtId) {
      return textToolResult(
        "thoughtId が指定されておらず、アクティブエディタからも導出できません。thoughtId を指定してください。",
      );
    }

    const action = options.input.action ?? "show";
    if (action === "semantic-audit") {
      return semanticAuditToolResult(
        thoughtId,
        options.input,
        editor?.document,
      );
    }

    if (action !== "show") {
      return textToolResult("Unsupported thought tool action.");
    }

    const snapshot = loadThought(
      thoughtId,
      resolveThoughtStorageLocation(editor?.document),
    );
    return textToolResult(renderThoughtToolView(snapshot, options.input.view));
  }

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ThoughtToolInput>,
  ): vscode.PreparedToolInvocation {
    return {
      invocationMessage: thoughtInvocationMessage(options.input),
    };
  }
}

export function activate(context: vscode.ExtensionContext): void {
  extensionContext = context;
  const outputChannel = vscode.window.createOutputChannel("LLMThink");
  const subscriptions: vscode.Disposable[] = [outputChannel];
  const previewStrings = getPreviewStrings(
    resolvePreviewLocale(vscode.env.language),
  );
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
      subscriptions.push(
        vscode.lm.registerTool(THOUGHT_TOOL_NAME, new ThoughtTool()),
      );
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

  startLspClient(context, outputChannel).catch((error: unknown) => {
    outputChannel.appendLine(
      `Failed to start LLMThink language server: ${String(error)}`,
    );
    outputChannel.show(true);
    vscode.window.showWarningMessage(
      "LLMThink language server を開始できませんでした。llmthink.languageServer.path の設定、PATH 上の llmthink-lsp、または拡張機能同梱サーバを確認してください。",
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
        document,
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
        vscode.window.showWarningMessage(previewStrings.previewMissingEditor);
        return;
      }

      await openPreviewForEditor(editor);
    }),
    vscode.commands.registerCommand("llmthink.dslPreviewBeside", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage(previewStrings.previewMissingEditor);
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
    vscode.commands.registerCommand(
      "llmthink.thoughtSemanticAudit",
      async () => {
        await saveThoughtSemanticAuditFromPrompt(outputChannel);
      },
    ),
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
