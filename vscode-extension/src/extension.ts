import * as path from "node:path";
import * as vscode from "vscode";
import {
  auditDslText,
  addThoughtReflection,
  draftThought,
  finalizeThought,
  formatAuditReportHtml,
  formatAuditReportText,
  formatThoughtHistory,
  formatThoughtList,
  formatThoughtReflections,
  formatThoughtSearchResults,
  formatThoughtSummary,
  getDslSyntaxGuidanceText,
  isDslHelpRequest,
  loadThought,
  listThoughts,
  recordThoughtAudit,
  relateThought,
  searchThoughtRecords,
  type ThoughtReflectionKind,
} from "llmthink";
import type { AuditReport } from "llmthink";

const DSL_TOOL_NAME = "llmthink-dsl";

interface DslToolInput {
  action?: "audit" | "help";
  dslText?: string;
  documentId?: string;
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

function renderToolResult(report: AuditReport): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([
    new vscode.LanguageModelTextPart(formatAuditReportText(report)),
    vscode.LanguageModelDataPart.json(report),
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
  const thoughtId = await promptThoughtId(toDocumentId(editor.document));
  if (!thoughtId) {
    return;
  }
  const text = editor.document.getText();
  draftThought(thoughtId, text);
  const report = await runAudit(text, thoughtId);
  recordThoughtAudit(thoughtId, report);

  outputChannel.clear();
  outputChannel.appendLine(formatAuditReportText(report));
  outputChannel.appendLine(JSON.stringify(report, null, 2));
  outputChannel.show(true);
  showReportPanel(context, report);
  vscode.window.showInformationMessage(
    `LLMThink thought 監査完了: ${thoughtId}`,
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
  const thoughtId = await promptThoughtId(toDocumentId(editor.document));
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

async function runAudit(
  text: string,
  documentId: string,
): Promise<AuditReport> {
  const report = await auditDslText(text, documentId);
  lastReport = report;
  return report;
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
      const report = await runAudit(
        providedText,
        options.input.documentId?.trim() || "tool-input",
      );
      return renderToolResult(report);
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          "監査対象テキストが渡されておらず、アクティブエディタもありません。dslText を指定してください。",
        ),
      ]);
    }

    const report = await runAudit(
      editor.document.getText(),
      options.input.documentId?.trim() || toDocumentId(editor.document),
    );
    return renderToolResult(report);
  }

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<DslToolInput>,
  ): vscode.PreparedToolInvocation {
    const documentId = options.input.documentId?.trim();
    return {
      invocationMessage: documentId
        ? `LLMThink で ${documentId} を監査しています`
        : "LLMThink で DSL を監査しています",
    };
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel("LLMThink");

  context.subscriptions.push(
    outputChannel,
    vscode.lm.registerTool(DSL_TOOL_NAME, new DslTool()),
    vscode.commands.registerCommand("llmthink.dslAudit", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage(
          "監査対象のアクティブエディタがありません。",
        );
        return;
      }

      const document = editor.document;
      const report = await runAudit(document.getText(), toDocumentId(document));

      outputChannel.clear();
      outputChannel.appendLine(formatAuditReportText(report));
      outputChannel.appendLine(JSON.stringify(report, null, 2));
      outputChannel.show(true);

      showReportPanel(context, report);
      vscode.window.showInformationMessage(
        `LLMThink 監査完了: ${report.document_id}`,
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
  );
}

export function deactivate(): void {
  // no-op
}
