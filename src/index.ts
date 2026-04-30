export { auditDslFile, auditDslText } from "./analyzer/audit.js";
export { getDslSyntaxGuidanceText, isDslHelpRequest } from "./dsl/guidance.js";
export { parseDocument, ParseError } from "./parser/parser.js";
export {
  formatAuditReportHtml,
  formatAuditReportText,
} from "./presentation/report.js";
export {
  formatThoughtReflections,
  formatThoughtHistory,
  formatThoughtList,
  formatThoughtSearchResults,
  formatThoughtSummary,
} from "./presentation/thought.js";
export {
  addThoughtReflection,
  relateThought,
  ensureThoughtRecord,
  finalizeThought,
  listThoughts,
  loadThought,
  recordThoughtAudit,
  draftThought,
  searchThoughtRecords,
} from "./thought/store.js";
export type * from "./model/ast.js";
export type * from "./model/diagnostics.js";
export type {
  ThoughtReflection,
  ThoughtReflectionKind,
} from "./thought/store.js";
