export { auditFile, auditText } from "./analyzer/audit.js";
export { getDslSyntaxGuidanceText, isDslHelpRequest } from "./dsl/guidance.js";
export { parseDocument, ParseError } from "./parser/parser.js";
export { formatAuditReportHtml, formatAuditReportText } from "./presentation/report.js";
export { formatThoughtHistory, formatThoughtList, formatThoughtSearchResults, formatThoughtSummary } from "./presentation/thought.js";
export {
	createRelatedThought,
	ensureThoughtRecord,
	finalizeThought,
	listThoughts,
	loadThought,
	persistAuditReport,
	saveThoughtDraft,
	searchThoughts,
} from "./thought/store.js";
export type * from "./model/ast.js";
export type * from "./model/diagnostics.js";