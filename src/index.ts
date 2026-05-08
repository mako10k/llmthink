export { auditDslFile, auditDslText } from "./analyzer/audit.js";
export { formatDocument, formatDslText } from "./dsl/format.js";
export {
  getDslSyntaxGuidanceText,
  isDslHelpRequest,
  parseDslHelpRequest,
} from "./dsl/guidance.js";
export type {
  DslHelpChannel,
  DslHelpDetail,
  DslHelpRequest,
} from "./dsl/guidance.js";
export { parseDocument, ParseError } from "./parser/parser.js";
export {
  formatAuditReportHtml,
  formatAuditReportText,
} from "./presentation/report.js";
export {
  formatPersistedThoughtAudit,
  formatThoughtReflections,
  formatThoughtHistory,
  formatThoughtList,
  formatThoughtSearchResults,
  formatThoughtSummary,
} from "./presentation/thought.js";
export {
  addThoughtReflection,
  deleteThought,
  relateThought,
  ensureThoughtRecord,
  finalizeThought,
  listThoughts,
  loadThought,
  recordThoughtAudit,
  draftThought,
  searchThoughtRecords,
} from "./thought/store.js";
export {
  auditAndPersistThought,
  deriveThoughtIdFromDocumentId,
  deriveThoughtIdFromFilePath,
  normalizeThoughtId,
} from "./thought/workflow.js";
export type * from "./model/ast.js";
export type * from "./model/diagnostics.js";
export type {
  ThoughtReflection,
  ThoughtReflectionKind,
} from "./thought/store.js";
export type { PersistedThoughtAudit, ThoughtIdSource } from "./thought/workflow.js";
