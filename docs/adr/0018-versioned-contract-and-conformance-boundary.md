# ADR-0018: Versioned contract artifactとsource-independent Conformance Kitを採用する

## Status

accepted

## Date

2026-08-28

## Decision Owner

llmthink decision owner

## Context

- ADR-0017はCoreのworkspace/test境界を固定し、cross-repository CIを最初のrepository分割後に定義するfollow-upを残した
- Issue #29はcontract専用repositoryを直ちに作らず、小さなversioned artifactとConformance KitをCore側に置く方針を固定した
- `llmthink-chatgpt-plugin@b480c84`はHosted MCP surfaceのversion/hashとtested server revisionを固定したが、そのartifactはconsumer側snapshotでありproducer/consumer共通の正本ではない
- pluginが検証したserver revision `df8e683`と保持WIP `c205a7d`にはonboardingとdeleteがある一方、現行mainのHosted MCP adapterにはまだない
- 現行mainへonboarding/deleteを追加すること、serverを分離すること、packageをpublishすることは今回のauthorityに含まれない
- 2026-08-28にdecision ownerは、次のtaskとしてcanonical contract v1とConformance Kitの抽出を進めるよう確認した

## Decision

同一repository内にprivate npm workspace `@llmthink/contracts` を作り、versioned interoperability artifactとsource-independent Conformance Kitの正本とする。

- package versionは`1.0.0`、Hosted MCP contract versionは`1`とする
- `hosted-mcp-v1.json`はpluginが固定したsurface artifactとbyte-equivalentに保ち、SHA-256 `774fb22a3ce4d6225cef7c791dc006414cf2795c54de308d08db17ed0245343d`を維持する
- input、output、error、scope、effectは別のversioned schema artifactへ記録し、manifestが各artifactのSHA-256を固定する
- Conformance Kitはserver/pluginのsourceをimportせず、artifact構造、hash、tool集合、effect、required field、scope、error codeを検査する
- tested producer descriptorは`df8e683`で相互運用が確認され、`c205a7d`までcontract差分がないWIP surfaceとする
- tested consumer descriptorは`llmthink-chatgpt-plugin@b480c84`とする
- contract/schema/dependency pathの変更時だけfocused contract testとdownstream plugin compatibilityを実行する
- current main Hosted MCP adapterはこのcontractのlive producerとして扱わない。server分離時にWIPをforward-portし、実装から生成したdescriptorを同じConformance Kitへ接続する
- workspaceはprivateのまま開始し、npm publish、release、別repository作成を行わない

## Alternatives Considered

- contract専用repositoryを新設する
  - ownership、release、publication境界を必要以上に増やし、Issue #29のnon-goalに反するため不採用
- plugin側snapshotを正本のままにする
  - producerがconsumer repositoryへ依存し、server分離と別consumer追加時にauthorityが逆転するため不採用
- 現行main serverの9 toolだけをcontract v1にする
  - tested trial surfaceのonboarding/deleteを暗黙に失い、pluginが固定したhashと相互運用証拠を無効化するため不採用
- 今回current mainへonboarding/deleteをforward-portしてlive producer testを追加する
  - contract抽出をserver機能変更と結合し、server分離前にauthority surfaceを広げるため不採用
- input/output/error/scopeをsurface artifactへ直接追加する
  - 既存consumerのbyte hashを不必要に破壊するため、versioned schema artifactを分ける案を採用

## Consequences

Good:

- plugin、server、将来のconsumerがserver内部sourceなしで同じcontractを検査できる
- surface artifactの既存hashを保持しながら、schemaの詳細を独立に追加できる
- contract変更だけがdownstream compatibilityを起動し、通常のCore/server/plugin変更のtest範囲を広げない
- server分離前にtested WIP surfaceと後継ownerを固定できる

Bad / Risk:

- surfaceとschemaの2 artifactを同じmanifestで同期する必要がある
- current main Hosted MCP adapterはcanonical trial contractのlive producerではなく、server分離までfixture evidenceに依存する
- packageをpublishしない段階ではconsumerがartifactをvendorまたはcommit/hashで固定する必要がある
- GitHub Actionsのdownstream checkはpublic plugin repositoryの可用性に依存する

Neutral:

- Core DSL/AST/audit schemaを同じworkspaceへ追加できるが、今回のHosted MCP v1抽出だけで公開SDKを完成扱いにしない
- full E2E、release、deployment、Production activationは通常contract PRのgateにしない

## Implementation Notes

- package: `packages/contracts/package.json`
- canonical artifacts: `packages/contracts/contracts/`
- Conformance Kit: `packages/contracts/src/`
- producer/consumer descriptors: `packages/contracts/fixtures/`
- focused package tests: `packages/contracts/test/`
- repository boundary tests: `test/contracts/hosted-mcp-contract-boundary.test.ts`
- path-limited downstream workflow: `.github/workflows/contracts.yml`
- task issue: [#33](https://github.com/mako10k/llmthink/issues/33)

## Review

- Contract review: tool names、effect、required field、scope、error code、artifact hashの一致を検査する
- Boundary review: package sourceがroot server、Core、plugin sourceをimportしないことを検査する
- Authority review: current main behavior、deployment、Production、publicationを変更していないことを確認する
- Successor review: tested producer/consumer revisionとserver split follow-upをmanifest、ledger、Issueへ残す

## Traceability

- Claim `C-CONTRACT-001`: remote consumerはserver内部sourceではなくversioned artifactへ依存しなければならない
  - Evidence `E-CONTRACT-001`: plugin分離前のcontract testはroot `src/index.ts`からserver implementationをimportしていた
  - Evidence `E-CONTRACT-002`: `llmthink-chatgpt-plugin@b480c84`はsource importなしでsurface hashを固定している
- Claim `C-CONTRACT-002`: tested WIP surfaceをcurrent mainの古いsurfaceへ暗黙に狭めてはならない
  - Evidence `E-CONTRACT-003`: current mainはonboarding/deleteを持たず、`df8e683..c205a7d`はそれらを含む
  - Evidence `E-CONTRACT-004`: plugin surface artifactはonboarding/deleteを含む11 toolを固定している
- Claim `C-CONTRACT-003`: contract変更だけがdownstream compatibilityを起動しなければならない
  - Evidence `E-CONTRACT-005`: Issue #29はcontract/schema/dependency変更、nightly、releaseだけをcross-repository test条件としている
- Action `A-CONTRACT-001` (`C-CONTRACT-001`, `C-CONTRACT-002`): private contracts workspaceとhash manifestを追加する
  - Status: completed by Issue #33 implementation
- Action `A-CONTRACT-002` (`C-CONTRACT-001`, `C-CONTRACT-003`): portable Conformance Kitとpath-limited CIを追加する
  - Status: completed by Issue #33 implementation
- Action `A-CONTRACT-003` (`C-CONTRACT-002`): live producer bindingをserver splitへ移管する
  - Status: pending in Issue #29 server phase

## Follow-ups

- `llmthink-server`分離時にimplementation-generated descriptorをConformance Kitへ接続する
- pluginがschema artifactを直接利用する必要が生じた時点で、package versionとschema hashをconsumer compatibility metadataへ追加する
- DSL AST/audit schemaの追加は実際のdownstream consumer要件とbreaking-change policyを確認してから行う
- package publicationはconsumer distribution要件とrelease authorityを別途確認してから判断する

## Auditability Notes

- surface/schema artifactを変更してmanifest hashまたはcontract versionを更新しない場合は本ADR違反とする
- current mainのtool listをcanonical trial surfaceのproducer evidenceとして扱ってはならない
- plugin/server sourceをConformance Kitへimportした場合はsource-independent boundary違反とする
- contract以外の通常変更で常にdownstream plugin CIを要求する運用へ戻る場合は、失敗実績と必要性を示して再判断する
