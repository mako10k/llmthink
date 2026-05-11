import type { AuditReport } from "../model/diagnostics.js";
import type { ParseError } from "../parser/parser.js";
export type DslHelpDetail = "index" | "quick" | "detail";
export type DslHelpChannel = "cli" | "mcp" | "vsix";
export interface DslHelpRequest {
    topic?: string;
    subtopic?: string;
    detail?: DslHelpDetail;
    channel?: DslHelpChannel;
    maxRelated?: number;
}
export declare function parseDslHelpRequest(input: string): DslHelpRequest | undefined;
export declare function isDslHelpRequest(input: string): boolean;
export declare function getDslSyntaxGuidanceText(request?: DslHelpRequest): string;
export declare function createDslGuidanceReport(documentId?: string): AuditReport;
export declare function createParseErrorReport(error: ParseError, documentId: string): AuditReport;
