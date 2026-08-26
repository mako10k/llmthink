import { CompletionItemKind, Position } from "vscode-languageserver/node.js";
import type { CompletionItem } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
export interface DslqlCompletionSpec {
    label: string;
    detail: string;
    documentation: string;
    insertText?: string;
    kind?: CompletionItemKind;
}
export declare function buildContextualDslCompletions(document: TextDocument, position: Position, documentation: Readonly<Record<string, string>>): CompletionItem[] | undefined;
export declare function isDslqlQueryPosition(document: TextDocument, position: Position): boolean;
export declare function buildDslqlCompletionItems(items: readonly DslqlCompletionSpec[]): CompletionItem[];
