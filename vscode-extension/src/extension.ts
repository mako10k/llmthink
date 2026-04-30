import * as path from "node:path";
import * as vscode from "vscode";
import { auditText, formatAuditReportHtml, formatAuditReportText } from "llmthink";
import type { AuditReport } from "llmthink";

const AUDIT_TOOL_NAME = "llmthink.auditDsl";

interface AuditToolInput {
  dslText?: string;
  documentId?: string;
}

let lastReport: AuditReport | undefined;
let lastPanel: vscode.WebviewPanel | undefined;

function buildPanelHtml(report: AuditReport): string {
  return formatAuditReportHtml(report);
}

function showReportPanel(context: vscode.ExtensionContext, report: AuditReport): void {
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
    lastPanel.onDidDispose(() => {
      lastPanel = undefined;
    }, undefined, context.subscriptions);
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

function runAudit(text: string, documentId: string): AuditReport {
  const report = auditText(text, documentId);
  lastReport = report;
  return report;
}

class AuditDslTool implements vscode.LanguageModelTool<AuditToolInput> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<AuditToolInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const providedText = options.input.dslText?.trim();
    if (providedText) {
      const report = runAudit(providedText, options.input.documentId?.trim() || "tool-input");
      return renderToolResult(report);
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart("監査対象テキストが渡されておらず、アクティブエディタもありません。dslText を指定してください。"),
      ]);
    }

    const report = runAudit(editor.document.getText(), options.input.documentId?.trim() || toDocumentId(editor.document));
    return renderToolResult(report);
  }

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<AuditToolInput>,
    _token: vscode.CancellationToken,
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
    vscode.lm.registerTool(AUDIT_TOOL_NAME, new AuditDslTool()),
    vscode.commands.registerCommand("llmthink.auditActiveDocument", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        void vscode.window.showWarningMessage("監査対象のアクティブエディタがありません。");
        return;
      }

      const document = editor.document;
      const report = runAudit(document.getText(), toDocumentId(document));

      outputChannel.clear();
      outputChannel.appendLine(formatAuditReportText(report));
      outputChannel.appendLine(JSON.stringify(report, null, 2));
      outputChannel.show(true);

      showReportPanel(context, report);
      void vscode.window.showInformationMessage(`LLMThink 監査完了: ${report.document_id}`);
    }),
    vscode.commands.registerCommand("llmthink.showLastAuditReport", async () => {
      if (!lastReport) {
        void vscode.window.showInformationMessage("まだ監査結果がありません。");
        return;
      }
      showReportPanel(context, lastReport);
      outputChannel.show(true);
    }),
  );
}

export function deactivate(): void {
  // no-op
}