export { auditDslFile, auditDslText } from "./analyzer/audit.js";
export type { AuditOptions } from "./analyzer/audit.js";
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
export {
  assertCommandIdentity,
  assertHostedId,
  assertIdempotencyRetention,
  assertRevision,
  assertThoughtRef,
  DEFAULT_IDEMPOTENCY_RETENTION_SECONDS,
  LLMTHINK_SERVER_API_VERSION,
  LLMTHINK_SERVER_ERROR_CODES,
  LLMTHINK_SERVER_FILE_SCHEMA_VERSION,
  LLMTHINK_SERVER_SCOPES,
  LlmthinkServerError,
  MAX_IDEMPOTENCY_RETENTION_SECONDS,
  MIN_IDEMPOTENCY_RETENTION_SECONDS,
} from "./server/contracts.js";
export type {
  AddReflectionCommand,
  AuditTextCommand,
  CommandIdentity,
  CreateThoughtCommand,
  FinalizeThoughtCommand,
  LlmthinkServerScope,
  NewThoughtRevision,
  PureAuditResult,
  RecordAuditCommand,
  RequestContext,
  RevisionPrecondition,
  SaveDraftCommand,
  ServerThoughtCurrentPointer,
  ServerThoughtFileRecord,
  ServerThoughtSnapshot,
  StoredIdempotencyRecord,
  ThoughtListQuery,
  ThoughtPage,
  ThoughtRef,
  ThoughtRepository,
  ThoughtSearchQuery,
} from "./server/contracts.js";
export {
  assertServerBindPolicy,
  isExplicitLoopbackHostname,
  LLMTHINK_SERVER_HTTP_STACK,
} from "./server/policy.js";
export type { ServerBindPolicyInput } from "./server/policy.js";
export { ServerFileThoughtRepository } from "./server/file-repository.js";
export type { ServerFileThoughtRepositoryOptions } from "./server/file-repository.js";
export { LlmthinkApplicationService } from "./server/application-service.js";
export type {
  LlmthinkApplicationServiceOptions,
  LlmthinkAuditRunner,
} from "./server/application-service.js";
export {
  createLlmthinkHttpHandler,
  createLlmthinkHttpServer,
  DEFAULT_HTTP_REQUEST_LIMIT_BYTES,
  DEFAULT_HTTP_RESPONSE_LIMIT_BYTES,
} from "./server/http.js";
export {
  createLlmthinkHostedMcpHandler,
  createLlmthinkHostedMcpServer,
  DEFAULT_MCP_REQUEST_LIMIT_BYTES,
  DEFAULT_MCP_TEXT_LIMIT_BYTES,
  type LlmthinkHostedMcpHandlerOptions,
} from "./server/hosted-mcp.js";
export type {
  LlmthinkHttpAuthenticator,
  LlmthinkHttpHandlerOptions,
} from "./server/http.js";
export {
  createLlmthinkOnboardingBridge,
  createLlmthinkOnboardingHandler,
  type LlmthinkOnboardingBridge,
  type LlmthinkOnboardingAuthenticator,
  type LlmthinkOnboardingHttpHandler,
  type LlmthinkOnboardingOptions,
  type OnboardingPrincipal,
} from "./server/onboarding.js";
export {
  SqliteLifecycleStore,
  TRIAL_AGREEMENT_ACTION_VERSION,
  type ActiveTermsArtifact,
  type NewScopePolicy,
  type NewTermsArtifact,
  type OnboardingAccountState,
  type ProvisionedTrialAccount,
  type ProvisionTrialAccountInput,
  type SqliteLifecycleStoreOptions,
  type ApprovedRecovery,
  type ArchiveAccessContext,
  type ArchiveReceipt,
  type RecoveryRequest,
} from "./server/sqlite-lifecycle-store.js";
export {
  LlmthinkArchiveService,
  type ArchiveLifecycleAuthority,
  type LlmthinkArchive,
  type LlmthinkArchiveServiceOptions,
} from "./server/archive-service.js";
export {
  loadOAuthAccountRegistry,
  OAUTH_ACCOUNT_REGISTRY_MAX_BYTES,
  OAUTH_ACCOUNT_REGISTRY_VERSION,
} from "./server/oauth-account-registry.js";
export {
  createLlmthinkOAuthDiscovery,
  oauthBearerChallenge,
  oauthProtectedResourceMetadata,
  OAUTH_PROTECTED_RESOURCE_PATH,
  type LlmthinkOAuthDiscovery,
  type LlmthinkOAuthDiscoveryOptions,
} from "./server/oauth-discovery.js";
export {
  createLlmthinkJwtIdentityVerifier,
  createLlmthinkJwtTokenVerifier,
  createLlmthinkRemoteJwks,
  type LlmthinkExternalOAuthIdentity,
  type LlmthinkExternalOAuthIdentityVerifier,
  type LlmthinkJwtVerifierOptions,
  type LlmthinkOAuthAccountResolver,
  type LlmthinkRemoteJwksOptions,
} from "./server/oauth-jwt.js";
export {
  assertVerifiedRequestContext,
  BoundedLlmthinkSecurityMetrics,
  DEFAULT_HOSTED_RATE_LIMIT,
  DEFAULT_HOSTED_METRIC_SERIES_LIMIT,
  DEFAULT_HOSTED_RATE_SUBJECT_LIMIT,
  DEFAULT_HOSTED_RATE_WINDOW_MS,
  DEFAULT_HOSTED_REQUEST_TIMEOUT_MS,
  createBearerTokenAuthenticator,
  InMemoryLlmthinkRateLimiter,
  LlmthinkSecurityBoundary,
  type InMemoryRateLimiterOptions,
  type BearerAuthenticatorOptions,
  type LlmthinkBearerTokenVerifier,
  type LlmthinkHostedAuthenticator,
  type LlmthinkHostedTransport,
  type LlmthinkRateLimiter,
  type LlmthinkSecurityBoundaryOptions,
  type LlmthinkSecurityMetric,
  type LlmthinkSecurityObservation,
  type LlmthinkSecurityObserver,
  type VerifiedBearerIdentity,
} from "./server/security.js";
