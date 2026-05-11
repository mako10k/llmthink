import type { AuditReport } from "../model/diagnostics.js";
export interface AuditReportFormatOptions {
    maxIssues?: number;
    maxQueryItemsPerResult?: number;
}
export declare function limitAuditReport(report: AuditReport, options?: AuditReportFormatOptions): AuditReport;
export declare function formatAuditReportText(report: AuditReport, options?: AuditReportFormatOptions): string;
export declare function formatAuditReportHtml(report: AuditReport, options?: AuditReportFormatOptions): string;
