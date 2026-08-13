export { auditDslFile, auditDslText } from "./analyzer/audit.js";
export type { AuditOptions } from "./analyzer/audit.js";
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
export * from "./dslql/query.js";
export {
  formatAuditReportHtml,
  formatAuditReportText,
  limitAuditReport,
} from "./presentation/report.js";
export {
  formatPersistedThoughtAudit,
  formatThoughtReflections,
  formatThoughtHistory,
  formatThoughtList,
  formatThoughtSearchResults,
  formatThoughtSemanticAuditPairs,
  formatThoughtSemanticAuditSummary,
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
  saveThoughtSemanticAudit,
  draftThought,
  searchThoughtRecords,
} from "./thought/store.js";
export {
  auditAndPersistThought,
  deriveThoughtIdFromDocumentId,
  deriveThoughtIdFromFilePath,
  normalizeThoughtId,
} from "./thought/workflow.js";
export {
  resolveRuntimeConfig,
  resolveEmbeddingConfig,
  resolveThoughtStorageRoot,
} from "./config/runtime.js";
export type {
  ConfigDomain,
  ResolveRuntimeConfigOptions,
  ResolvedRuntimeConfig,
  ResolvedValueSource,
  ResolvedEmbeddingConfig,
} from "./config/runtime.js";
export {
  AUDIT_RESULT_CATEGORIES,
  AUDIT_SEVERITIES,
} from "./model/diagnostics.js";
export type * from "./model/ast.js";
export {
  createEvidenceResource,
  EvidenceResourceValidationError,
  validateEvidenceResource,
} from "./model/evidence-resource.js";
export type { EvidenceResourceInput } from "./model/evidence-resource.js";
export type * from "./model/diagnostics.js";
export {
  collectDocumentDeclarations,
  createDocumentDeclarationIndex,
  DocumentDeclarationIndex,
  DOCUMENT_DECLARATION_KINDS,
  DuplicateDocumentDeclarationError,
} from "./model/declarations.js";
export type {
  DocumentDeclaration,
  DocumentDeclarationKind,
  DocumentDeclarationNode,
} from "./model/declarations.js";
export type {
  ThoughtStoreLocation,
  ThoughtReflection,
  ThoughtReflectionKind,
  ThoughtSemanticAuditInput,
  ThoughtSemanticAuditVerdict,
  ThoughtSnapshot,
} from "./thought/store.js";
export type {
  PersistedThoughtAudit,
  ThoughtIdSource,
} from "./thought/workflow.js";
