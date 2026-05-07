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
      enableScripts: false,
    };

    const update = () => {
      webviewPanel.title = `LLMThink Preview: ${previewTitle(document)}`;
      webviewPanel.webview.html = renderDslPreview(
        document.getText(),
        previewTitle(document),
      );
    };

    const changeSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() !== document.uri.toString()) {
        return;
      }
      update();
    });

    webviewPanel.onDidDispose(
      () => {
        changeSubscription.dispose();
      },
      undefined,
      this.context.subscriptions,
    );

    update();
  }
}