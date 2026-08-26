import { type CodeAction } from "vscode-languageserver/node.js";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { DocumentAst } from "../model/ast.js";
import type { AuditIssue } from "../model/diagnostics.js";
export declare function buildCodeActions(document: TextDocument, ast: DocumentAst, issues: AuditIssue[]): CodeAction[];
