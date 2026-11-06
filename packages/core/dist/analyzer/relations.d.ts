import type { DocumentAst, SourceSpan } from "../model/ast.js";
import type { AuditIssue } from "../model/diagnostics.js";
export type RelationFinding = Omit<AuditIssue, "issue_id">;
export declare function relationFinding(id: string, rule: string, message: string, severity: AuditIssue["severity"], span: SourceSpan, extra?: Record<string, unknown>): RelationFinding;
export declare function auditRelations(document: DocumentAst): RelationFinding[];
