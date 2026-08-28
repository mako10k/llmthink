# LLMThink Server Architecture

## 1. Status and scope

本書は hosted llmthink server の proposed design であり、実装済み仕様ではない。

対象:

- transport 非依存 Application Service
- server 用 file backend
- REST/JSON API
- Streamable HTTP MCP
- llmthink Plugin と Skills の責務境界
- DB、refgraph-core、sealgraph へ移行可能な port

非対象:

- production deployment
- public Plugin submission
- OAuth provider の選定と構築
- DB schema の確定
- refgraph-core / sealgraph の採用決定
- MCP Apps UI
- existing local store の破壊的 migration

## 2. Architecture

```text
CLI   VSIX   stdio MCP      REST /api/v1   HTTP MCP /mcp
 |      |        |                |               |
 +------+--------+----------------+---------------+
                         |
                 Application Service
                  command/query/policy
                         |
        +----------------+----------------+
        |                                 |
 llmthink Core                    ThoughtRepository
 parse/audit/DSLQL                revision/transaction
                                          |
                     +--------------------+--------------------+
                     |                    |                    |
               ServerFileStore       SQL adapter        Graph adapters
                    first              future              undecided
```

依存方向は adapter から Application Service、Application Service から Core と port までとする。Core と port は HTTP、MCP SDK、ChatGPT、filesystem layout を知らない。

## 3. Application contracts

serializableなHosted API version、scope、error code、command/query/result型は
`@llmthink/contracts`が所有する。verified `RequestContext`、repository port、persistence、
validator、security、transport実装は`@llmthink/server`が所有する。

初期 use case は次とする。

### Query

- audit text without persistence
- get thought snapshot
- list thoughts
- search thoughts
- get thought events

### Command

- create thought draft
- update thought draft
- record audit result
- finalize thought
- add reflection

delete、relate、semantic audit write は既存機能として残るが、初期 hosted public surface への追加は個別に判断する。

すべての use case は `RequestContext` を受ける。

```ts
interface RequestContext {
  subjectId: string;
  tenantId: string;
  workspaceId: string;
  scopes: readonly string[];
  requestId: string;
}
```

adapter が anonymous local mode を提供する場合も、固定された local subject/tenant/workspace を明示的に生成し、process cwd から暗黙導出しない。

## 4. Identity and authorization

公開 identity は `tenant_id`、`workspace_id`、`thought_id` と `revision` で構成する。filesystem path、database primary key、graph node ID は公開しない。

初期 scope:

- `thought:read`
- `thought:write`
- `thought:finalize`
- `audit:run`

authorization は resource の tenant/workspace と scope の両方を server で確認する。Skills、tool description、client UI が許可を拡張することはない。

## 5. Repository contract

概念 interface:

```ts
interface ThoughtRepository {
  create(input: NewThought, context: RequestContext): Promise<ThoughtSnapshot>;
  get(
    ref: ThoughtRef,
    context: RequestContext,
  ): Promise<ThoughtSnapshot | null>;
  list(query: ThoughtListQuery, context: RequestContext): Promise<ThoughtPage>;
  search(
    query: ThoughtSearchQuery,
    context: RequestContext,
  ): Promise<ThoughtPage>;
  saveDraft(
    ref: ThoughtRef,
    update: DraftUpdate,
    expectedRevision: number,
    context: RequestContext,
  ): Promise<ThoughtSnapshot>;
  finalize(
    ref: ThoughtRef,
    input: FinalizeInput,
    expectedRevision: number,
    context: RequestContext,
  ): Promise<ThoughtSnapshot>;
  appendEvent(
    ref: ThoughtRef,
    event: ThoughtEventInput,
    expectedRevision: number,
    context: RequestContext,
  ): Promise<ThoughtSnapshot>;
}
```

repository method は domain transaction boundary であり、個別 file CRUD の抽象ではない。実装は expected revision が一致しない更新を `revision_conflict` として拒否する。

## 6. Server file backend

初期 layout:

```text
<data-root>/
  tenants/<tenant-id>/
    workspaces/<workspace-id>/
      thoughts/<thought-id>/
        CURRENT
        revisions/
          <zero-padded-revision>/
            record.json
            draft.think
            final.think
            semantic-audit.think
            events.jsonl
            reflections.jsonl
            audits/<audit-id>.json
```

要求:

- server が検証済み ID から path を構築する
- user supplied path、absolute path、`..` を key として受理しない
- 同一 thought の write を直列化する
- revision は temporary directory へ完全に書き、file と directory を fsync してから immutable revision directory へ rename する
- commit point は fsync 済み `CURRENT` pointer の atomic rename とする
- incomplete temporary revision と `CURRENT` が指さない orphan revision は読まず、自動昇格させない
- `CURRENT` が存在しない revision または不完全な revision を指す場合は fail closed する
- idempotency key の成功結果を同じ scope 内で再利用する
- idempotency scope は subject、operation、resource、request digest とし、同じ key で digest が異なる場合は conflict とする
- idempotency retention は既定24時間、設定可能範囲1時間から7日とし、test では clock を注入する
- secrets、token、DSL 本文を通常の request log に記録しない
- startup 時に unsupported schema version を fail closed する

file backend は single host の初期 backend とする。multi-process safety、network filesystem、horizontal scaling は保証しない。

## 7. REST API

初期 HTTP stack は Node `http` とし、追加 routing framework は導入しない。MCP は `@modelcontextprotocol/sdk` の Node 用 `StreamableHTTPServerTransport` を使う。routing、body limit、timeout、authentication adapter、error mapping は llmthink の HTTP adapter が所有する。

初期 route:

```text
GET  /healthz
GET  /readyz
POST /api/v1/audits
POST /api/v1/thoughts
GET  /api/v1/thoughts
GET  /api/v1/thoughts/{thought_id}
PUT  /api/v1/thoughts/{thought_id}/draft
POST /api/v1/thoughts/{thought_id}/audits
POST /api/v1/thoughts/{thought_id}/finalize
POST /api/v1/thoughts/{thought_id}/reflections
GET  /api/v1/thoughts/{thought_id}/events
POST /api/v1/thoughts/search
```

`POST /api/v1/audits` は保存しない。thought に結果を記録する操作は `/thoughts/{thought_id}/audits` を使う。

成功 envelope:

```json
{
  "data": {},
  "request_id": "req_...",
  "warnings": []
}
```

error envelope:

```json
{
  "error": {
    "code": "revision_conflict",
    "message": "The thought has changed.",
    "retryable": false,
    "details": {
      "expected_revision": 3,
      "actual_revision": 4
    }
  },
  "request_id": "req_..."
}
```

HTTP status と error code の対応は API schema 作成時に固定する。message を programmatic branch に使用しない。

## 8. MCP interfaces

local compatibility の stdio MCP は維持する。hosted MCP は Streamable HTTP `/mcp` を使う。

初期 hosted tools:

| Tool                     | Use case            | Effect              |
| ------------------------ | ------------------- | ------------------- |
| `audit_thought`          | text を保存せず監査 | read-only           |
| `create_thought_draft`   | draft 作成          | write               |
| `get_thought`            | snapshot 取得       | read-only           |
| `list_thoughts`          | 一覧取得            | read-only           |
| `search_thoughts`        | 検索                | read-only           |
| `finalize_thought`       | revision 指定で確定 | consequential write |
| `add_thought_reflection` | reflection 追記     | write               |
| `get_thought_history`    | event 取得          | read-only           |

tool result は machine-readable structured content を正本とし、text は model と人間向けの bounded presentation とする。tool は内部で REST endpoint を呼ばず、同じ Application Service を直接利用する。

## 9. Plugin and Skills

Plugin は hosted MCP 接続、Skills、将来の optional UI を配布する client integration である。server の認可境界ではない。

Pluginの配布物と通常検査は独立したpublic
[`mako10k/llmthink-chatgpt-plugin`](https://github.com/mako10k/llmthink-chatgpt-plugin)で管理する。
server sourceを直接importせず、固定MCP contract version/hashとtested server revisionで互換性を記録する。

初期 Skills:

- `llmthink-author`: problem、evidence、decision を draft に構造化する
- `llmthink-auditor`: pure audit を実行し、unknown を勝手に解消しない
- `llmthink-reflector`: concern、follow-up、audit response を既存 thought に追記する

Skills は secret を収集せず、scope、revision、confirmation を迂回しない。UI は tool contract、authorization test、model-readable result の受入後まで導入しない。

## 10. Backend evolution

backend 移行は同じ repository contract test を使う。

- SQL candidate: snapshot、revision、tenant ownership、transaction の正本
- refgraph-core candidate: declaration/thought relation の traversal projection
- sealgraph candidate: immutable revision、digest、provenance verification

これらは候補であり、現段階で役割を確定しない。特に graph store を採用しただけで authorization や transaction が満たされるとは扱わない。

## 11. Observability and privacy

記録するもの:

- request ID
- authenticated subject の pseudonymous ID
- tenant/workspace の pseudonymous ID
- use case / tool name
- result code、latency、revision conflict
- MCP initialization と schema error

通常 log に記録しないもの:

- access token、authorization header
- `.think` 本文
- audit の全文
- reflection text
- provider secret

## 12. Acceptance gates

### Design gate

- ADR-0007、0008、0009 が proposed として監査可能である
- server design `.think` が fatal/error/warning なしである
- 実装済みと proposed scope が区別されている

### First implementation gate

- Application Service が HTTP/MCP SDK に依存しない
- server file backend が path traversal、revision conflict、concurrent write、crash recovery test を通る
- pure audit が永続化しない
- REST と MCP が同じ use case contract test を通る
- stdio MCP、CLI、VSIX の既存 behavior が回帰しない
- authentication 無効時は loopback 以外への bind を拒否する

### Plugin gate

- MCP Inspector で initialization、schema、正負 tool call、authorization を確認する
- direct、indirect、follow-up、write confirmation、out-of-scope の tool-selection eval を通す
- public deployment と submission は別の明示承認まで行わない

## 13. Open decisions

- OAuth provider と token audience
- process topology。初期 file backend の保証は single host、single server process とする
- SQL、refgraph-core、sealgraph の正本/投影分担
- semantic search provider の hosted privacy/cost contract
- relation と semantic audit write を hosted public tool に含める時期
