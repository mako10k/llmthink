# Server Foundation R1 evidence candidate

## Status

- Milestone: `SERVER_FOUNDATION_IMPLEMENTED`
- Criterion set: `SERVER_FOUNDATION_R1` revision `R1`
- Criterion-set commitment: `sha256:2844004e541ab190f6f3bdf50d5339e232250954fad61e0f4143da550250b7af`
- Collected at: `2026-08-19T09:47:22+09:00`
- Repository HEAD: `bcc090a7f7b53c0d4bfbfb74160ef92158dda56c`
- Evidence state: candidate only; the implementation and this record are not committed, so no milestone acceptance receipt has been issued.

## APPLICATION_USE_CASES

Criterion commitment: `sha256:78455603e58debf41ecf864f92f35d4857624fd87a940402f2e40c241dabfa31`

Command:

```console
node --import tsx --test test/server/application-service.test.ts
```

Result: 7 tests passed, 0 failed. The tests cover non-persistent pure audit, equivalence with the Core audit result, explicit scope denial, missing verified identity, stable `not_found`, revision conflict, idempotent replay, compound audit authorization, and finalization confirmation.

## REPOSITORY_SAFETY

Criterion commitment: `sha256:53ebe565c4970b791632e73c7c2e8ba092e3bd2707e2acb986df9ac731674a34`

Command:

```console
node --import tsx --test test/server/file-repository.test.ts
```

Result: 8 tests passed, 0 failed. The tests cover an explicit absolute data root, immutable revisions and atomic `CURRENT`, traversal rejection, tenant isolation, serialized concurrent writes, stale revision rejection, scoped idempotency and conflict, append-only domain history, orphan non-promotion, incomplete revision and unsupported-schema fail-closed behavior, and workspace-bounded list/search.

The repository constructor has no default data-root path and rejects relative roots, so hosted authority cannot fall back to the process cwd.

## TRANSPORT_INDEPENDENCE

Criterion commitment: `sha256:cf309e52ce647002c43e47b5be61a270a5e3c1673b7cfe224448e03fc009a4d7`

Artifact inspection found:

- `src/server/application-service.ts` imports Core models, thought types, and server contracts only.
- No `node:http`, `@modelcontextprotocol`, `process.cwd`, or URL dependency occurs in the Application Service.
- Public thought identity remains `tenantId`, `workspaceId`, `thoughtId`, and revision; no backend path is exposed.
- `npm pack --dry-run --json` contains all three generated Application Service artifacts and reports 123 package entries.

Relevant SHA-256 identities:

```text
7f7c25ec7007552e309706114bb329a9171b55873aaf3fe48eef485bda479f68  src/server/application-service.ts
54714bb6c9dd0e2fe8e82c32e06a6dfede32bbab120f85abd81b4f286d93d855  src/server/contracts.ts
7136bb29592035d7e1e82a09c8ce8ff67f127f0f6e672cbfc964ffdc2a00ccbb  src/server/file-repository.ts
c80bde6bab64c46df38a0f6a8ba7bcb1af3607a354c2cb4147efab876302bc09  test/server/application-service.test.ts
fb14cb5d07b82e814b783d2401f318c5a3e4e0c561f7a61b2678b17406b35d6d  test/server/file-repository.test.ts
6eee833125462a52c7a4e0cb3228c04bbef95cb7eab588491cbea000aed11ba8  dist/server/application-service.d.ts
d0c30845bd2adfedacd70b894964a31afac0e3c74503bf4acd2f27e18ad3f547  dist/server/application-service.js
1afd49e872922be098c8f736fe580ed13266c34b280b798d626c304ed53a74bb  dist/server/application-service.js.map
```

## FOUNDATION_REGRESSION

Criterion commitment: `sha256:f2507f408e28b512fea24a03502e0e85b097483b764b4a7915bf1702b8e672ea`

The following gate completed as one successful command chain:

```console
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run verify-examples
npm pack --dry-run
perttool document check plans/server-implementation.pert
npx tsx src/cli.ts dsl audit docs/process/server-architecture-review.think --min-severity warning
git diff --check
```

Results:

- Full tests: 139 passed, 0 failed.
- Typecheck, lint, format check, build, and four example verifications passed.
- Package dry run produced `llmthink-1.2.0.tgz` metadata with 123 files; no publish occurred.
- PERT document validation passed. Closure warning `PTDAG-208` is expected while acceptance is pending; later milestones still lack their future criterion sets.
- LLMThink audit reported fatal/error/warning/info/hint counts all zero.
- Git whitespace validation passed.

## Receipt boundary

All four criteria have passing candidate evidence. Acceptance remains pending because the evidence-bearing implementation and this record do not yet have a committed Git revision. After a bounded commit, rerun or reconcile the exact committed artifacts before issuing criterion receipts. Do not use the pre-existing HEAD alone as the evidence revision.
