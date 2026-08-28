# Hosted root surface inventory

## Purpose

Issue [#37](https://github.com/mako10k/llmthink/issues/37)で、共有契約の所有権を
`@llmthink/server`から外す前に、公開済みroot surfaceとcurrent mainの追加surfaceを
区別する。本書は互換性の判断材料であり、export削除、package公開、releaseを認可しない。

## Evidence baseline

- npm registryの`llmthink@1.3.0` tarball integrity:
  `sha512-VVrz0pBqp50e84WF6Ms/lHtHCojjw8IhErTiC7i2daN70FEozrJQJMrmpA2DPq1jGiMw9/YIwUJ4JU3GUNCYEQ==`
- Git tag `v1.3.0`: commit `eccd7d9942892ab7825c18e98b22c8ebe418971b`
- published packageは`@llmthink/core`、`@llmthink/contracts`、`@llmthink/server`へ
  依存せず、`dist/server/**`をroot tarballへ同梱していた
- 2026-08-28のnpm registry readbackでは、上記3 scoped packageはいずれも未公開だった
- current main `e7b40605daea23be3219713b888437f02c441ed9`では、root applicationから
  `@llmthink/server`へのsource参照は`src/index.ts`のcompatibility re-exportと
  `src/server/hosted-main.ts`のbin facadeに限定される
- current canonical Hosted MCP v1は、`packages/server`のimplementation-owned registryから
  生成されるonboarding 1 tool + admitted 10 toolのlive producerである

## Published `llmthink@1.3.0` surface

### Root entrypointから公開したserver symbols

| Published module group                  | Symbols                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Proposed ownership                        | Compatibility treatment                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------- |
| Hosted API literals                     | `LLMTHINK_SERVER_API_VERSION`, `LLMTHINK_SERVER_SCOPES`, `LlmthinkServerScope`, `LLMTHINK_SERVER_ERROR_CODES`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | shared Hosted contract                    | Contractsを正本とし、Server/rootからcompatibility re-exportする              |
| Serializable command/query/result types | `AuditTextCommand`, `CommandIdentity`, `CreateThoughtCommand`, `AddReflectionCommand`, `FinalizeThoughtCommand`, `RecordAuditCommand`, `RevisionPrecondition`, `SaveDraftCommand`, `ThoughtRef`, `ThoughtListQuery`, `ThoughtSearchQuery`, `ThoughtPage`, `ServerThoughtSnapshot`, `PureAuditResult`                                                                                                                                                                                                                                                                                                                                                                      | shared Hosted contract                    | Contractsを正本とし、root名はcompatibility re-exportで維持する               |
| Verified execution context              | `RequestContext`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | server application/security boundary      | Serverに残し、root exportは互換surfaceとしてのみ扱う                         |
| Repository port                         | `ThoughtRepository`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | server application boundary               | Serverに残し、root exportは互換surfaceとしてのみ扱う                         |
| Persistence schema                      | `LLMTHINK_SERVER_FILE_SCHEMA_VERSION`, `ServerThoughtCurrentPointer`, `ServerThoughtFileRecord`, `StoredIdempotencyRecord`, `NewThoughtRevision`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | server persistence implementation         | Serverに残す。共有契約へ昇格しない                                           |
| Validation/error implementation         | `assertCommandIdentity`, `assertHostedId`, `assertIdempotencyRetention`, `assertRevision`, `assertThoughtRef`, `DEFAULT_IDEMPOTENCY_RETENTION_SECONDS`, `MIN_IDEMPOTENCY_RETENTION_SECONDS`, `MAX_IDEMPOTENCY_RETENTION_SECONDS`, `LlmthinkServerError`                                                                                                                                                                                                                                                                                                                                                                                                                   | server implementation/policy              | Error code集合だけを共有し、class・validator・retention policyはServerに残す |
| Bind policy                             | `assertServerBindPolicy`, `isExplicitLoopbackHostname`, `LLMTHINK_SERVER_HTTP_STACK`, `ServerBindPolicyInput`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | server deployment/security implementation | Serverに残す                                                                 |
| File repository                         | `ServerFileThoughtRepository`, `ServerFileThoughtRepositoryOptions`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | server persistence implementation         | Serverに残す                                                                 |
| Application Service                     | `LlmthinkApplicationService`, `LlmthinkApplicationServiceOptions`, `LlmthinkAuditRunner`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | server application implementation         | Serverに残す                                                                 |
| REST adapter                            | `createLlmthinkHttpHandler`, `createLlmthinkHttpServer`, `DEFAULT_HTTP_REQUEST_LIMIT_BYTES`, `DEFAULT_HTTP_RESPONSE_LIMIT_BYTES`, `LlmthinkHttpAuthenticator`, `LlmthinkHttpHandlerOptions`                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | server transport implementation           | Serverに残す                                                                 |
| Hosted MCP adapter                      | `createLlmthinkHostedMcpHandler`, `createLlmthinkHostedMcpServer`, `DEFAULT_MCP_REQUEST_LIMIT_BYTES`, `DEFAULT_MCP_TEXT_LIMIT_BYTES`, `LlmthinkHostedMcpHandlerOptions`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | server transport implementation           | Serverに残す                                                                 |
| Security implementation                 | `assertVerifiedRequestContext`, `BoundedLlmthinkSecurityMetrics`, `DEFAULT_HOSTED_RATE_LIMIT`, `DEFAULT_HOSTED_METRIC_SERIES_LIMIT`, `DEFAULT_HOSTED_RATE_SUBJECT_LIMIT`, `DEFAULT_HOSTED_RATE_WINDOW_MS`, `DEFAULT_HOSTED_REQUEST_TIMEOUT_MS`, `createBearerTokenAuthenticator`, `InMemoryLlmthinkRateLimiter`, `LlmthinkSecurityBoundary`, `InMemoryRateLimiterOptions`, `BearerAuthenticatorOptions`, `LlmthinkBearerTokenVerifier`, `LlmthinkHostedAuthenticator`, `LlmthinkHostedTransport`, `LlmthinkRateLimiter`, `LlmthinkSecurityBoundaryOptions`, `LlmthinkSecurityMetric`, `LlmthinkSecurityObservation`, `LlmthinkSecurityObserver`, `VerifiedBearerIdentity` | server security implementation            | Serverに残す                                                                 |

### Published bin

`llmthink-hosted-mcp`は公開済みroot binであり、server runtime全体を起動する。これは共有契約ではなく
実装互換surfaceである。rootから削除する場合は、同じ利用経路を提供する配布物または明示的な
breaking migrationが必要になる。

## Current mainで追加された未公開surface

| Current-only surface                                                               | Proposed ownership            | Treatment                                                |
| ---------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------- |
| `DeleteThoughtCommand`, `ThoughtDeletionReceipt`                                   | shared Hosted contract        | canonical v1のdelete schemaと同じ意味を持つContracts正本 |
| `LlmthinkOnboardingMcpOptions`, `LlmthinkOnboardingPrincipal`                      | server onboarding adapter     | Serverに残す                                             |
| `HOSTED_MCP_TOOL_NAMES`, `hostedMcpProducerSurface`, `hostedMcpProducerDescriptor` | server live producer registry | Serverに残し、ContractsのConformance Kitで検証する       |

## Dependency constraint

次の3条件は同時には満たせない。

1. root packageが`@llmthink/server`へruntime依存しない
2. `llmthink@1.3.0`で公開したserver implementation exportとbinを同じroot import/installで維持する
3. server implementationをroot tarballへ同梱・複製しない

runtime implementationをrootから再exportまたは起動するには、そのimplementationをrootへ同梱するか、
install可能な別packageへ依存する必要がある。どちらも行わない場合、公開済みsurfaceは破壊的に
削除される。この制約はtestやdescriptorでは解消できない。

## Implemented Stage A/B boundary

共有Hosted APIの正本をContractsへ移し、Serverがその正本を使用する。rootのimplementation
compatibility facadeとbinは維持する。最終的なroot runtime dependency除去は、公開互換surfaceの
移行先がownerに承認されるまで未完了であり、root release holdも継続する。
