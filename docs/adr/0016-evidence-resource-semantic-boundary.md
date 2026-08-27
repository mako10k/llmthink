# ADR-0016: Evidence resourceをsemantic inputへ暗黙昇格させない

## Status

accepted

## Date

2026-08-26

## Decision Owner

llmthink decision owner

## Context

- evidenceは利用者が記述する必須本文を持ち、0個以上の匿名`resource:` blockで出典や取得先を補足できる
- resourceのlocator、digest、MIME、labelはprovenanceまたはmetadata claimであり、resource本文の取得結果ではない
- 通常のparse / auditはURL fetch、file read、digest verification、MIME sniffを行わず、同じ入力から再現可能な結果を返す
- DSLQL semantic runtimeはevidenceの明示本文をtext-bearing nodeとして扱う一方、resource locatorとmetadataを暗黙本文へ含めない
- `mime`は記述者によるclaimであり、取得内容の検証済みmedia typeでもprovider選択authorityでもない
- resource取得、本文抽出、OCR、caption、binary fingerprint、media別embeddingには、I/O authority、resource bound、失敗意味論、再現性、provider/model契約が別途必要になる
- 2026-08-26にdecision ownerは、これらを「将来実装する段階」ではなく、採否を含めて現時点のscope外とするよう確認した

## Decision

- resourceを持つevidenceも、semantic inputは既存の利用者記述本文を基準とし、resource由来の部分を追加しない
- resourceの`url`、`file`、`blob`、`digest`、`mime`、`label`を、evidenceのsemantic text、semantic candidate、embedding inputへ暗黙追加しない
- `mime`またはlocator kindからembedding provider / modelを自動選択しない
- resourceの自動取得、本文抽出、OCR、画像caption、audio transcription、binary fingerprint、content-derived embeddingを現時点の非目標とする
- 上記機能はdeferred roadmapまたはfollow-up phaseではなく、未採用のideaである。将来の互換性、実装時期、採用を約束しない
- resourceは引き続き構造検証、provenance表示、DSLQLのlossless projectionに利用できる。semantic処理へ参加しないことはresource supportの欠落を意味しない
- resource-only evidenceは導入せず、evidenceの利用者記述本文を必須のまま維持する
- 本ADRは既存の非resource semantic text選択規則を変更しない。annotationなどresource以外の明示フィールドの扱いはDSLQL semantic contractを正とする

採用を再提案する場合は、別Issueと別ADRで少なくとも次を提示しなければならない。

- 実在する利用例と、既存のevidence本文では不足する理由
- 取得対象と入力authority、明示opt-in、認証情報の境界
- size、件数、時間、再帰、redirect、formatの上限
- type判定authorityとprovider / model選択契約
- offline、timeout、partial extraction、mismatch時の失敗意味論
- cache、freshness、digest、resolution receiptを含む再現性契約
- private content、ログ、保存、送信先に関するsecurity / privacy review

この再入場条件は実装予定ではなく、新しい提案を現在の契約へ混入させないためのreview gateである。

## Alternatives Considered

- evidence本文とresource metadataを連結してtext embeddingする
  - locatorやlabelの語彙が内容類似度へ混入し、metadata claimとsource contentを区別できないため不採用
- MIMEごとにtext、image、audio、binary用providerを選択するstaged roadmapを定義する
  - 未検証のMIME claimへprovider authorityを与え、採用していないI/O機能を将来契約として固定するため不採用
- resourceを取得できる場合だけcontent embeddingし、失敗時はevidence本文へfallbackする
  - network、cache、credential、実行場所によってsemantic resultが変わり、失敗とfallbackの意味も曖昧になるため不採用
- resourceを持つevidenceはsemantic query対象から外す
  - 利用者が明示したevidence本文まで失われ、resource追加が既存文書の意味を弱めるため不採用
- resourceをprovenance payloadとして保持し、semantic inputへ昇格させない
  - 現行の再現可能な監査契約と実装済みsemantic boundaryを維持できるため採用

## Consequences

Good:

- resource metadataに機密的または偶発的な文字列が含まれても、暗黙にembedding providerへ送信されない
- URL可用性、実行場所、MIME claim、cache状態にsemantic resultが依存しない
- evidence本文とprovenance payloadの責務が分離され、resourceを追加しても既存のsemantic inputが変わらない
- media処理の採用を約束せず、具体的な必要性が出た場合だけ独立して評価できる

Bad / Risk:

- PDF、画像、音声、binaryの内容はresource locatorを付けるだけではsemantic search対象にならない
- 利用者は検索したい内容をevidence本文へ明示的に記述する必要がある
- 大量resourceからの自動知識抽出を期待する利用例には対応しない

Neutral:

- resourceの構造検証、DSLQL projection、preview表示、digest/MIME metadata契約は変わらない
- 通常のtext embedding provider設定と文字列literalのon-demand embedding予算は変わらない

## Implementation Notes

- runtime変更は不要である。`packages/core/src/dslql/semantic.ts`はresource fieldsをsemantic text対象に含めていない
- `packages/core/test/dslql/query.test.ts`で、全locator / metadata系文字列がembedding batchへ入らないことを回帰検査する
- requirements、DSLQL spec、Help、README、evidence resource設計文書を同じ境界へ同期する
- Issue #6のstaged roadmap表現は本ADRで却下されたため、Issue本文もAccepted boundaryへ更新する

## Review

- Specialist review: 現行semantic runtime、resource projection、I/O-free audit境界と整合する
- Non-specialist review: decision ownerが2026-08-26に、採否を含めてscope外とする表現を確認した
- Root-chain review: ADR-0001の監査エンジン責務を拡張せず、既存evidence本文とresource provenanceの分離を維持する

## Traceability

- Claim `C-RES-EMB-001`: resource追加によって、利用者が明示していないsemantic inputを生成してはならない
  - Evidence `E-RES-EMB-001`: resource metadataはprovenance claimであり、取得contentではない
  - Evidence `E-RES-EMB-002`: `packages/core/test/dslql/query.test.ts`はresource metadataを除外したembedding batchを検証している
- Claim `C-RES-EMB-002`: 通常auditとsemantic queryの入力は、暗黙resource I/Oに依存してはならない
  - Evidence `E-RES-EMB-003`: evidence resource contractは通常parse / auditで外部I/Oを行わない
  - Evidence `E-RES-EMB-004`: 現行runtimeにはresource取得、OCR、caption、fingerprint capabilityが存在しない
- Claim `C-RES-EMB-003`: 未採用ideaをdeferred roadmapとして約束してはならない
  - Evidence `E-RES-EMB-005`: decision ownerは採否を含めてscope外とするよう明示した
- Action `A-RES-EMB-001` (`C-RES-EMB-001`, `C-RES-EMB-002`): public specs、Help、READMEを本ADRへ同期する
  - Status: completed by this decision change
- Action `A-RES-EMB-002` (`C-RES-EMB-001`): locator / digest / MIME / labelのsemantic除外を回帰検査する
  - Status: completed by the DSLQL semantic test
- Action `A-RES-EMB-003` (`C-RES-EMB-003`): Issue #6のstaged roadmapをAccepted non-goal boundaryへ置き換える
  - Status: completed when the Issue body is updated and closed

## Follow-ups

- 予定された実装follow-upはない
- 再入場条件を満たす独立提案が提出された場合だけ、新しいIssueとADRで採否を判断する

## Auditability Notes

- resource metadataがsemantic text selectorまたはembedding batchへ入った場合は本ADR違反として扱う
- MIME claimがprovider / model選択authorityとして使われた場合は本ADR違反として扱う
- resolver、OCR、caption、transcription、fingerprint、content embeddingを追加する提案は、本ADRの再入場条件を満たすまで実装しない
- evidence本文の必須性またはresource-only evidenceを変更する場合は、role clarityとsemantic input authorityを別ADRで再判断する
