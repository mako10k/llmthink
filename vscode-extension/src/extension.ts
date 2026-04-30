import * as path from "node:path";
import * as vscode from "vscode";
import { auditText, formatAuditReportHtml, formatAuditReportText } from "llmthink";
import type { AuditReport } from "llmthink";

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

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel("LLMThink");

  context.subscriptions.push(
    outputChannel,
    vscode.commands.registerCommand("llmthink.auditActiveDocument", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        void vscode.window.showWarningMessage("監査対象のアクティブエディタがありません。");
        return;
      }

      const document = editor.document;
      const report = auditText(document.getText(), toDocumentId(document));
      lastReport = report;

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