# ADR-0021: Hosted共有契約をServer実装から分離してroot互換面を段階移行する

## Status

accepted

## Date

2026-08-28

## Decision Owner

llmthink decision owner

## Context

- decision ownerは、Serverを共通部分の所有者にせず、共有部分を外出しして依存方向を整理する意図を確認した
- この確認はservice-only、npm非配布、root公開API/binの即時削除、major releaseを決定していない
- PR #36はHosted serverをprivate `@llmthink/server` workspaceへ移し、canonical 11-tool live producerを実装へ接続した
- PR #39は未確認の配布・互換判断を含んだPR #38をrevertし、PR #36の実働境界を復元した
- npm公開済み`llmthink@1.3.0`はserver implementationと`llmthink-hosted-mcp` binをroot tarballへ同梱していた
- current mainは公開名を保つため、rootから未公開private `@llmthink/server@1.0.0`へ依存する一時facadeを持つ
- root local applicationのserver source参照は`src/index.ts`と`src/server/hosted-main.ts`のcompatibility surfaceに限定される
- `@llmthink/core`、`@llmthink/contracts`、`@llmthink/server`はいずれも2026-08-28時点でnpm registry未公開である
- 公開surfaceの完全な分類は[Hosted root surface inventory](../process/hosted-root-surface-inventory.md)に記録する

## Decision

次の段階実装を採用する。

### Stage A: 共有契約の正本を外出しする

- Hosted API version、scope集合、error code集合、serializableなcommand/query/result型を`@llmthink/contracts`の所有候補とする
- `@llmthink/server`は共有契約を再定義せず、Contractsの正本をimportしてApplication Service、REST、MCPで使用する
- canonical Hosted MCP v1 artifact、schema、Conformance Kit、11-tool producer bindingは維持する
- ContractsからCoreの`AuditReport`型を参照する必要がある場合は、type-onlyの正確version依存として明示し、Conformance Kitのserver非依存性を維持する

### Stage B: server固有実装を共有契約へ混ぜない

- verified `RequestContext`、`ThoughtRepository`、file schema/idempotency record、validator、error class、retention policyはServerに残す
- Application Service、file repository、REST/MCP adapter、security、bind policy、live producer registryはServerに残す
- root local CLI、stdio MCP、thought store、LSPはServerをimportしない
- rootのserver importは、公開互換を維持する`src/index.ts`と`src/server/hosted-main.ts`だけに限定し、boundary testで固定する

### Stage C: root互換面は別のowner判断まで維持する

- Stage A/Bではroot Hosted export、`llmthink-hosted-mcp` bin、`@llmthink/server` compatibility dependencyを削除しない
- root release holdを維持し、private workspaceへ依存したroot tarballを公開しない
- root runtime dependencyを最終的に除去する前に、server implementationのinstall経路と公開済みroot surfaceの移行経路をownerが選択する
- package publish、repository作成、release、deployment、Production activationはこのADRの実装authorityに含めない

## Accepted Scope

2026-08-28にdecision ownerはStage A/Bを次の実装単位として採用した。

- 共有Hosted契約をContractsへ移し、root互換facade/binを維持したままfocused contract/server/root compatibility testまで実装する
- server配布方式とroot互換面の最終廃止は、この判断へ混ぜず後続判断とする
- Stage C、package publish、release、deployment、Production activationは認可しない

## Alternatives Considered

- rootからserver dependency、export、binを直ちに削除する
  - 公開済みruntime surfaceをreplacementなしで破壊し、確認されていないservice-only/major判断を暗黙に行うため不採用
- server implementationをrootへ再同梱または複製する
  - dependency manifestは消せるが、実装authorityとrelease/test境界を再結合するため不採用
- optional/peer dependencyとdynamic importでroot名だけ残す
  - default installで公開API/binが動かず、互換維持を装うだけになるため不採用
- shared contractを`@llmthink/core`へ置く
  - Hosted tenant、scope、revision、idempotency、transport errorはDSL/parser/analyzer Coreの責務ではないため不採用
- shared contractをServerへ置いたままrepository分割だけ進める
  - consumerとadapterがserver implementation packageへ依存し続け、確認済みの依存方向に反するため不採用
- shared contract専用の新しい4個目packageを作る
  - current Contracts packageが既にversioned artifactとConformance Kitを所有しており、具体的な分離要件なしにpackageを増やすため不採用

## Consequences

Good:

- Server実装を共有契約の正本にせず、plugin、将来SDK、REST/MCP adapterが同じversioned contractを参照できる
- 11-tool live producerを維持したまま、共有surfaceと実装surfaceを明示的に分離できる
- 配布方式やbreaking releaseを未決定のまま、実用上意味のある依存方向の改善を実施できる

Bad / Risk:

- Stage A/B完了後もroot packageの一時server runtime dependencyは残り、root release holdは解除されない
- ContractsがCoreの型へ依存する場合、Core contract変更時のdownstream検査範囲を明示する必要がある
- 公開root surfaceの最終移行には、別package配布またはbreaking changeのowner判断が必要になる

Neutral:

- service-only、npm package、container、repository artifactのどれをserver配布方式にするかは決めない
- current root compatibility surfaceを維持することは、その長期残置を決定しない

## Implementation Notes

- proposed shared source: `packages/contracts/src/hosted-api.ts`
- server consumer: `packages/server/src/contracts.ts`
- root compatibility exports: `src/index.ts`
- root bin facade: `src/server/hosted-main.ts`
- ownership guard: `test/contracts/server-package-boundary.test.ts`
- source inventory: `docs/process/hosted-root-surface-inventory.md`
- task issue: [#37](https://github.com/mako10k/llmthink/issues/37)

## Review

- Contract review: shared候補がserializable API meaningに限定され、persistence/security implementationを含まないことを確認する
- Dependency review: Contracts/Core/Server/rootのimport方向とexact versionを確認する
- Compatibility review:root export名とbinがStage A/Bで削除されず、local adaptersがHosted serverを経由しないことを確認する
- Producer review:11-tool runtime registryから生成したdescriptorがcanonical v1へconformすることを確認する
- Authority review:package publication、release、deployment、Production、major version、root surface削除を実行していないことを確認する

## Traceability

- Claim `C-SHARED-HOSTED-001`: 共有Hosted APIの正本をserver implementation packageが所有してはならない
  - Evidence `E-SHARED-HOSTED-001`: current `packages/server/src/contracts.ts`はwire command/resultとrepository/file/security用型を同じmoduleで定義する
  - Evidence `E-SHARED-HOSTED-002`: canonical MCP artifactとConformance Kitは既に`@llmthink/contracts`が所有する
- Claim `C-SHARED-HOSTED-002`: dependency除去は公開済みruntime surfaceをreplacementなしで破壊してはならない
  - Evidence `E-SHARED-HOSTED-003`: npm `llmthink@1.3.0`はserver exportsと`llmthink-hosted-mcp` binをroot tarballに同梱する
  - Evidence `E-SHARED-HOSTED-004`: current scoped Core/Contracts/Server packagesはregistry未公開である
- Claim `C-SHARED-HOSTED-003`: contractはlive producerへ接続されなければ完成扱いにできない
  - Evidence `E-SHARED-HOSTED-005`: PR #36はonboarding/deleteを含む11-tool registryをruntimeとConformance Kitへ接続した
- Action `A-SHARED-HOSTED-001` (`C-SHARED-HOSTED-001`): shared Hosted API sourceをContractsへ抽出する
  - Status: implemented by Issue #37
- Action `A-SHARED-HOSTED-002` (`C-SHARED-HOSTED-002`): root compatibility facade/binとrelease holdを維持する
  - Status: implemented by Issue #37
- Action `A-SHARED-HOSTED-003` (`C-SHARED-HOSTED-003`): focused contract/server/root compatibility gateを実行する
  - Status: implemented by Issue #37

## Follow-ups

- server distributionとroot compatibility終了条件を別ADRで決定する
- release candidateを作る前にCore/Contracts/Serverのpublication順、integrity、readbackを決定する

## Auditability Notes

- shared Hosted APIをServerで再定義した場合は依存方向を再監査する
- persistence layout、verified identity、rate limit、bind policyをContractsへ移す提案では共有要件を要求する
- root compatibility surfaceを削除する変更は、このADRのacceptanceだけでは認可されない
- descriptor/schemaだけを追加しcanonical live producerへ接続しない変更は完了扱いにしない
- Stage A/Bでroot release holdを解除した場合はauthority violationとする
