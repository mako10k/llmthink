export { auditDslFile, auditDslText } from "./analyzer/audit.js";
export type { AuditOptions } from "./analyzer/audit.js";
export { evaluateConfidence } from "./analyzer/confidence.js";
export { getDslExample } from "./dsl/examples.js";
export { formatDocument, formatDslText } from "./dsl/format.js";
export {
  alternateLlmthinkFilePath,
  isLlmthinkFilePath,
  llmthinkFileExtension,
  stripLlmthinkFileExtension,
  LLMTHINK_CANONICAL_FILE_EXTENSION,
  LLMTHINK_FILE_EXTENSIONS,
  LLMTHINK_LEGACY_FILE_EXTENSIONS,
} from "./dsl/file-extension.js";
export type { LlmthinkFileExtension } from "./dsl/file-extension.js";
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
export type { AuditReportFormatOptions } from "./presentation/report.js";
export { cosineSimilarity, embedTexts } from "./semantic/embeddings.js";
export type {
  EmbeddingProviderName,
  EmbeddingRequestOptions,
} from "./semantic/embeddings.js";
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
  CONFIDENCE_PROFILE_ID,
  confidenceKeywordsFor,
  ConfidenceValueError,
  createConfidenceAssessment,
  createRationalValue,
  DEFAULT_EDGE_CONFIDENCE,
  DEFAULT_SOURCE_CONFIDENCE,
  MAX_RATIONAL_DIGITS,
  multiplyConfidenceAssessments,
  parseUnitRational,
  rationalToString,
  resolveConfidenceKeyword,
  serializeConfidenceAssessment,
  EDGE_CONFIDENCE_KEYWORDS,
  SOURCE_CONFIDENCE_KEYWORDS,
} from "./model/confidence.js";
export type * from "./model/confidence.js";
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
