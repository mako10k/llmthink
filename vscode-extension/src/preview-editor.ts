import * as path from "node:path";
import * as vscode from "vscode";
import { renderDslPreview } from "./preview";

export const DSL_PREVIEW_VIEW_TYPE = "llmthink.preview";

function previewTitle(document: vscode.TextDocument): string {
  const baseName = path.basename(document.fileName || document.uri.path);
  return baseName.replace(/\.dsl$/i, "") || "active-document";
}

export class DslPreviewEditorProvider implements vscode.CustomTextEditorProvider {
  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new DslPreviewEditorProvider(context);
    return vscode.window.registerCustomEditorProvider(
      DSL_PREVIEW_VIEW_TYPE,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      },
    );
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): void {
    webviewPanel.webview.options = {
      enableScripts: true,
    };

    const revealLocation = async (line: number, column: number) => {
      const existingEditor = vscode.window.visibleTextEditors.find(
        (editor) => editor.document.uri.toString() === document.uri.toString(),
      );
      const selection = new vscode.Selection(
        Math.max(0, line - 1),
        Math.max(0, column - 1),
        Math.max(0, line - 1),
        Math.max(0, column - 1),
      );
      const editor = await vscode.window.showTextDocument(document, {
        preview: false,
        preserveFocus: false,
        viewColumn: existingEditor?.viewColumn ?? vscode.ViewColumn.Beside,
        selection,
      });
      editor.revealRange(selection, vscode.TextEditorRevealType.InCenter);
    };

    const update = () => {
      webviewPanel.title = `LLMThink Preview: ${previewTitle(document)}`;
      webviewPanel.webview.html = renderDslPreview(
        document.getText(),
        previewTitle(document),
      );
    };

    const messageSubscription = webviewPanel.webview.onDidReceiveMessage((message) => {
      if (message?.type !== "revealLocation") {
        return;
      }
      const line = Number(message.line);
      const column = Number(message.column ?? 1);
      if (!Number.isFinite(line) || !Number.isFinite(column)) {
        return;
      }
      void revealLocation(line, column);
    });

    const changeSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() !== document.uri.toString()) {
        return;
      }
      update();
    });

    webviewPanel.onDidDispose(
      () => {
        messageSubscription.dispose();
        changeSubscription.dispose();
      },
      undefined,
      this.context.subscriptions,
    );

    update();
  }
}