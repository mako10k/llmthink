# ADR-0023: semantic-audit-v1 artifact提案を撤回する

## Status

accepted

## Date

2026-09-08

## Decision Owner

llmthink decision owner

## Context

- GitHub Issue #43の監査改善候補として、`semantic-audit.think`を独立した
  `semantic-audit-v1` artifact kindにし、専用parser、formatter、AST、dispatcherを
  Coreとroot applicationへ追加する要件候補`SAR-V1-R1`を作成した
- 候補の確定byte列は
  `sha256:a6d5e41cef7d02e6afd9a4e16792c138b47da8265e5097ba0c90afd0325d1584`
  であり、statusは`not accepted`、独立reviewは未実施だった
- 現行の`thought semantic-audit`は、人または外部reviewerが判断した
  decision/support関係のverdictをsidecarへ記録する機能である
- 一方、Coreの`semantic_analysis`と`semantic_hint`はembeddingを用いる補助的な
  監査結果であり、sidecarのverdict記録とは責務が異なる
- ADR-0001はLLMThinkを真偽判定器ではなく、明示された思考の内部整合性を監査する
  engineとして定義している
- ADR-0016は外部resourceをsemantic inputへ暗黙昇格させず、通常auditを外部I/Oへ
  依存させない
- 専用artifact契約をLLMThinkへ追加すると、外部の意味判断を行う仕組みではなく、
  その結果を記録するためだけに新しい文法、dispatch、互換性面を恒久的に所有する
  ことになる
- decision ownerは2026-09-08に`REVISE`ではなく、`semantic-audit-v1`提案自体を
  撤回すると明示した

## Decision

- `SAR-V1-R1`を撤回し、`semantic-audit-v1`を採用しない
- `semantic-audit.think`のための専用artifact kind、Core parser、formatter、AST、
  syntax audit、CLI dispatcherを追加しない
- 撤回済み要件候補と未実施review inputは作業treeから除去し、本ADRが撤回判断と
  対象digestの記録を担う
- 現行の`thought semantic-audit`と既存sidecarは、この判断によって直ちに削除、
  移行、再解釈しない。これらの互換性面を廃止する場合は、利用状況と移行影響を
  分離して判断する
- Coreの`semantic_analysis`と`semantic_hint`は補助的auditとして維持する。
  embedding結果は真偽、severity、finalize、承認のauthorityにならない
- Sealgraph、Refgraphその他の外部systemへsemantic reviewを委任するintegrationは
  本ADRでは採用しない。具体的なuse caseと境界が確定した場合に、別要件と別ADRで
  判断する
- Issue #43では本候補を完了条件から除き、次順位の「final本文とclean auditを
  source digestまたはrevisionで結ぶopt-in finalize gate」を扱う

## Alternatives Considered

- `semantic-audit-v1`を独立artifactとして採用する
  - 外部review結果の記録のためにCore grammarとdispatch surfaceを増やし、
    LLMThinkの中心責務に対して複雑さが大きいため不採用
- `semantic_audit`を一般reasoning DSLのstatement roleへ追加する
  - review receiptと推論本文の意味を混在させ、既存parser/model全体へ影響するため
    不採用
- SealgraphまたはRefgraph integrationを同時に決定する
  - provenance、relation、hosted accessの役割候補はあるが、具体的な入出力契約と
    採用authorityが未確定なため不採用
- 現行sidecar機能も同時に削除する
  - 撤回対象は未採用の新artifact契約であり、既存利用者の互換性変更までは
    authoriseされていないため不採用
- 新artifactを増やさず、次順位のfinalize gateへ進む
  - LLMThink自身の監査結果とfinal本文の同一性を検証する小さい境界に集中できるため
    採用

## Consequences

Good:

- LLMThink Coreへ新しい文法系統とartifact dispatchを追加せずに済む
- embeddingによる補助audit、外部semantic review、review結果の保存という異なる
  責務を混同しない
- Issue #43の次の目的である、監査済みbyte列とfinalize対象byte列の一致へ集中できる

Bad / Risk:

- 既存`semantic-audit.think`は一般DSL auditで正式にparse、validateできない状態が続く
- 外部review結果の共通交換形式はLLMThinkからは提供されない
- 現行sidecar interfaceの長期的な扱いは未決のまま残る

Neutral:

- `semantic_analysis`、`semantic_hint`、通常のreasoning-v1 audit contractは変わらない
- SealgraphやRefgraphの採否、release、deployment、外部repositoryの変更は行わない

## Implementation Notes

- 撤回対象candidate: `SAR-V1-R1`
- 撤回対象candidate digest:
  `sha256:a6d5e41cef7d02e6afd9a4e16792c138b47da8265e5097ba0c90afd0325d1584`
- 未実施review input digest:
  `sha256:4b91b878970b9e6ca448390599f1ccf4282b2552ebe86437acfb81ef1e4067ff`
- `docs/process/semantic-audit-support-review.dsl`は過去の設計検討資料として残すが、
  accepted requirementまたは実装authorityとして扱わない

## Review

- Specialist review: 専用artifact/parser/dispatcherを追加しないため、ADR-0017のCore/root
  package boundaryへ新しい契約面を作らない
- Non-specialist review: 意味が正しいかをLLMThink自身に判定させる機能を増やさず、
  LLMThink自身の監査とfinal本文が同一かを確かめる次の改善へ進む
- Root-chain review: ADR-0001の内部整合性監査、ADR-0016の外部I/O非依存境界を維持する

## Traceability

- Claim `C-SA-WITHDRAW-001`: 未採用candidateをLLMThinkの公開artifact契約へ昇格させない
  - Evidence `E-SA-WITHDRAW-001`: `SAR-V1-R1`は`not accepted`で独立review未実施だった
  - Evidence `E-SA-WITHDRAW-002`: decision ownerが2026-09-08に提案撤回を明示した
- Claim `C-SA-WITHDRAW-002`: 撤回対象と既存互換性面を分離する
  - Evidence `E-SA-WITHDRAW-003`: candidateは新しいartifact kindとparser/dispatcherを
    提案し、現行storeはすでにsidecar書き込みを提供している
- Claim `C-SA-WITHDRAW-003`: embedding補助auditはsemantic-audit-v1撤回とは別責務である
  - Evidence `E-SA-WITHDRAW-004`: Core audit reportは`semantic_analysis` metadataと
    `semantic_hint` findingを持ち、sidecar verdictをparseしない
- Action `A-SA-WITHDRAW-001` (`C-SA-WITHDRAW-001`): candidateとreview inputを除去し、
  digestを本ADRへ保存する
  - Status: completed by this decision change
- Action `A-SA-WITHDRAW-002` (`C-SA-WITHDRAW-002`): 現行sidecar機能は変更せず、廃止を
  別decisionへ留保する
  - Status: completed by this decision boundary
- Action `A-SA-WITHDRAW-003` (`C-SA-WITHDRAW-003`): Issue #43の次順位でfinalize gateを
  要件化する
  - Status: in progress

## Follow-ups

- final本文とclean auditをsource digestまたはrevisionで結ぶopt-in finalize gateの
  現行契約、failure semantics、互換性を確認し、versioned requirementとして判断する
- 現行`thought semantic-audit`を廃止する場合は、既存sidecar利用とmigrationを調査した
  別提案を作成する
- 外部semantic review integrationは、具体的な利用者、入出力、authority、failure
  semanticsが確定した場合だけ再提案する

## Auditability Notes

- `semantic-audit-v1`、専用parser/formatter/AST、basename dispatcherが本ADRを
  supersedeせず追加された場合はdecision違反として扱う
- `semantic_analysis`または`semantic_hint`が真偽、finalize、承認を単独で決めた場合は
  ADR-0001との境界違反として扱う
- 本ADRだけを根拠に既存sidecarを削除または移行してはならない
- 外部system integrationをroadmap上の確定事項として扱う場合は、新しい要求authorityと
  ADRを必要とする
