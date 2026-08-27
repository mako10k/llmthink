import { type CodeAction } from "vscode-languageserver/node.js";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { type AuditIssue, type DocumentAst } from "@llmthink/core";
export declare function buildCodeActions(document: TextDocument, ast: DocumentAst, issues: AuditIssue[]): CodeAction[];
