# Generic Profile and Audit Contract V2 — 要求候補 R1 日本語全文訳

本書は `generic-profile-v2-r1.md` のレビュー支援用日本語訳であり、正本ではない。要求の
authorityは英語正本の確定bytesにある。

状態: Step 1候補、自己レビュー済み、未受入

要求リビジョン: R1

外部契約名: Generic Profile and Audit Contract V2

候補日: 2026-09-11

決定オーナー: llmthink decision owner

## 1. 目的

この候補は、汎用的な宣言、link、operation、read-only queryから成る、明示的に選択される
第2のLLMThink文法とruntime modelを定義する。ユースケース固有の意味は、parser固有の
statement分岐ではなく、版付きprofileが担う。

V2はV1と並存する追加機能である。V1文書、thought store、command、report、公開adapterの
既定動作を置換、再解釈、移行、非推奨化、変更しない。将来V1へcutoverまたはV1を廃止する
場合は、別のオーナー判断を必要とする。

## 2. Authorityとsource snapshot

次の入力をこの候補向けに固定する。GitHub body digestは、CLIが追加する末尾改行を含まない
正確なUTF-8 Issue本文に対するSHA-256である。

| 入力                         | Snapshot                                                                                       | R1での扱い                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 2026-09-11のオーナー方針     | 「V1を維持しつつV2を進める」                                                                   | 規範的な共存境界                                           |
| GitHub Issue #10             | 2026-05-08更新、本文 `sha256:08d393d8b62676d0426e94c54edecfeb6501c7d8b12d6c96e2851264b5f32f71` | V1のguidanceによるprofile動作を維持し、V1 roleを変更しない |
| GitHub Issue #25             | 2026-08-19更新、本文 `sha256:e1d77d8b4ac58964ace1303b32299712ea93c5ed2e29ec40a10797bdea5f19df` | 主要V2案。ただし後発の共存authorityと本R1 scopeで限定      |
| GitHub Issue #43             | 2026-09-08更新、本文 `sha256:5fec6a52fad9b96730e7cc264c5a0175297f21dc4f0d7f8c4e695b1153224076` | 現行V1 audit baselineとprovenance要求                      |
| `docs/specs/requirements.md` | `sha256:7d6c93d8c67f903c3730d2b5872f72bed796fe7af2f512c5b62c4c9604c35812`                      | 既存V1規範baselineとして維持                               |
| ADR-0018                     | `sha256:0eb3f1a1f1bf03dfb09acde37b5b72ff3bc121761dc05fbdcd54c1c4df1d3beb`                      | 版付きcontractとconformance境界を維持                      |
| ADR-0019                     | `sha256:76b3f01c6e29dad77641b43ec40e7b07329cabdb9cc8fad777e2efdeea56f1d4`                      | 段階的serverとlive binding境界を維持                       |
| ADR-0021                     | `sha256:370be2fe27dedc739e4b8438e6a797925c6ab28e70f84550ad6a794f623ad70a`                      | Hosted V1とroot互換surfaceを維持                           |
| ADR-0023                     | `sha256:587d4142d8dc47bb31d52a02279487fdbf74fb9d4a66a72451b621385fbfcee4`                      | semantic-audit artifactやtruth authorityを再導入しない     |
| Issue #43 reconciliation     | `sha256:670625a36972a6fca7c35c918a052f4a919c1a67bbb90b858557c7c441569dae`                      | 実現可能性の証拠のみであり、要求authorityではない          |
| `plans/rca-profile-v2.pert`  | `sha256:a78302cb3c8e08639029c8b922d0af14f124d91ab1f88a537840e6b67b05caa0`                      | 提供順序とreview gate。単独では製品authorityではない       |

## 3. 既存authorityの扱い

1. sourceがV2を明示選択しない場合、V1を既定文法のまま維持する。
2. 既存V1 role名、AST collection、audit rule、DSLQL動作、`.think`/`.dsl`の扱い、
   thought-store semantics、公開adapter動作は本contractで変更しない。
3. Issue #25が提案するV2の単純化は、明示選択されたV2文書とV2 runtimeの内部だけへ適用する。
4. 現行Hosted MCP contract V1、root export、互換binは本contractで改名も削除もしない。
5. 既存semantic sidecarはV2文書文法の外側に置く。本contractは撤回済み
   `semantic-audit-v1`案を復活させない。
6. Issue #25のnamespace locator、hosted scope expression、authorization、thought横断pagination、
   cross-namespace loadingは将来拡張として残す。R1は型付き拡張境界を残さなければならないが、
   これらはR1の受入基準ではない。

## 4. 定義

- **V1 document**: 既存文法version `1`でparseされる文書。
- **V2 document**: 最初のcomment以外の宣言で、後述のV2 profile headerを明示選択する文書。
- **profile**: 許可するkind、relation、operator、property、containment、state、transition、構造制約、
  severity、query templateを定義する不変の宣言データ。
- **profile reference**: `profile_id`、`profile_version`、`profile_digest`の組。
- **Core V2 IR**: 1つのV2文書を表す、ユースケース中立の正規化表現。
- **structural audit**: 現実世界の真偽を判定せず、宣言されたsyntax、identity、reference、graph形状、
  profile制約、lifecycle宣言を検証すること。
- **presentation**: raw件数とtruncationを明示する場合だけfilterまたは省略できる人向け表示。
  raw結果は変更しない。

## 5. 明示的な文法とprofile選択

1. V2 sourceは、commentと空行を除き、次のheaderで開始しなければならない。

   ```think
   think <profile-id>@<profile-version>:
     discipline loose|guided|strict
   ```

2. 最初の同梱reasoning profile referenceは`reasoning@2.0.0`とする。
3. `think` headerだけを自動V2 dispatch信号とする。これを持たないsourceは既存V1 dispatch pathを
   通さなければならない。実装は後続tokenやfile内容からV2を推定してはならない。
4. 未知のprofile ID/version、利用不能なprofile bytes、profile digest不一致はfail closedとする。
   近似version、latest version、network、V1へのfallbackは禁止する。
5. 解決したprofile referenceをnormalized documentとすべてのraw audit reportへ含める。
6. Profile versionはsemantic-version文字列とする。Profile bytesは、RFC 8785 canonical JSON bytesに
   対する`sha256:<lowercase hex>`で識別する。
7. package同梱profileは、ID/versionをただ1つのdigestへbindingするmanifestを持つ。明示供給された
   profileは、依存文書のparseまたはaudit前にcaller指定digestと照合する。

## 6. V2 core syntaxとnormalized IR

V2 parserは`think` headerの後で、次の4つの実行可能な宣言familyだけを認識する。

```think
<kind> <id>:
  "text"
  state <state>
  <property> <value>

link <from> <relation> <to>:
  <property> <value>

op <id> <operator> <input-ref-list> -> <output-ref-list>:
  <property> <value>

query <id>:
  <dslql-expression>
```

nodeの1行宣言も有効とする。Containerはnestingを使うが、正規化時にはmembershipを`parent_id`と
source orderとして記録する。Coreは特定ユースケース名のparser分岐を持ってはならない。

Normalized documentは次のtop-level collectionだけを持つ。

```text
document
├── grammar_version
├── profile_ref
├── discipline
├── nodes[]
├── links[]
├── operations[]
└── queries[]
```

sourceを持つすべてのnode、link、operation、query、propertyは、source identityと開始/終了の
line/columnを含む共通source spanを保持する。Nodeは`kind`、`id`、任意text、state、properties、
`parent_id`、source order、spanを持つ。Linkはendpoint、relation、properties、source order、spanを
持つ。OperationはID、operator、順序付きinput/output、properties、`parent_id`、source order、spanを
持つ。QueryはID、expression、source order、spanを持つ。

## 7. 宣言的profile contract

Profileは不変データでなければならず、次を定義する。

- profile ID、semantic version、schema version、digest
- 許可されるnode kindと、そのtext、state、property、containment contract
- 許可されるrelation、その方向性または対称性、endpoint-kind contract、property
- 許可されるoperator、input/output arity、input/output-kind contract、property
- 許可されるstateとstate transition
- default disciplineとdiscipline別severity mapping
- 安定したrule IDとtarget選択rule
- 任意のread-only query helperとtemplate
- 対応するgrammarと継承profileの互換性宣言

R1のprofile constraintは、次のclosed operatorだけを組み合わせられる。

- `reference_exists`
- `kind_allowed`
- `endpoint_kinds`
- `arity`
- `property_required`
- `property_value_in`
- `unique`
- `count`
- `relation_required`
- `relation_forbidden`
- `path_required`
- `acyclic`

各constraintは、宣言されたkind、relation、operator、property値、state、containmentによりtargetを
選択でき、closedな`all`、`any`、`not` predicateでselectorを組み合わせられる。Constraintが出力
できるのは、安定したrule ID、category、disciplineで選択されたseverity、target reference、
message key、宣言済みmetadataだけとする。

Profile dataは、実行可能code、profile供給のregular-expression実行、shell command、dynamic import、
callback、network location、filesystem location、provider credentialを含んではならない。新しい
constraint operatorの追加はGeneric Profile and Audit Contractの変更であり、review済みの新contract
revisionを必要とする。Closed contractを使用したprofile追加ではparser変更を必要としない。

## 8. Discipline

- `loose`はsyntax、identity一意性、reference解決、profile identity、profile contract integrityを
  強制する。それ以外のprofile constraintは、profileがinvariant指定した場合を除きinformationalとする。
- `guided`はさらに、欠落したprovenance、relation、property、containment、lifecycle構造をprofileの
  guided severityで報告する。
- `strict`は、すべてのprofile constraintとtransitionをprofileのstrict severityで強制する。

Syntax failure、ambiguous identity、構造解釈に必要なunresolved reference、profile unavailable、
digest mismatch、invalid profile dataは、`loose`選択によって成功にはならない。

## 9. Structural auditとraw report

1. Auditは宣言された構造と明示供給されたinputだけを評価する。
2. Auditは命題の真偽、evidence品質、因果の真偽、goal達成、semantic equivalence、統計的独立性、
   現実世界の状態を判定してはならない。
3. Core auditは暗黙のnetwork、filesystem、repository、thought-store、embedding、provider accessを
   実行してはならない。
4. Findingは安定したrule ID、category、severity、個別span付きの各target reference、message identity、
   message、任意のrationale、suggestion、metadataを公開する。
5. Raw reportはsource digest、grammar version `2`、完全なprofile reference、engine version、package
   version、semantic provider/model/status、summary counts、findings、順序付きlossless query valuesを
   含む。
6. Provider unavailableを明示し、semantic queryの意味を変えるsynthetic similarityや
   lexical/all-candidate fallbackで代替してはならない。
7. Presentationはraw評価後にseverity/category/locationでfilterでき、valueをtruncateできるのは
   filter前またはtruncate前の件数とtruncation stateを報告する場合だけとする。
8. CLI、Core、stdio MCP、Hosted Application Service、LSP、VSIXは、rule ID、severity、target reference、
   span、message identityが一致するconformantな構造identityを生成する。Adapter固有表示fieldは
   異なってよい。
9. 構造的にcleanなreportが証明するのは、選択したprofile snapshotへの適合だけである。真偽、承認、
   実装、実効性、release、外部受入を証明しない。

## 10. Read-only DSLQL

1. V2 DSLQLは`nodes`、`links`、`operations`、`queries`を読む。Profile kindごとのtop-level collectionを
   追加してはならない。
2. R1はcurrent-document scopeだけを提供する。
3. Generic helperは`links([relation])`、`inputs()`、`outputs()`、`producer()`、
   `upstream([relation])`、`downstream([relation])`、`lineage()`に限定する。
4. Profileは通常DSLQLへ展開されるquery templateと名前を提供できるが、実行可能evaluator codeを
   installしてはならない。
5. Query実行はread-onlyであり、fetch、persist、finalize、approve、mutate、missing linkのinferを
   行ってはならない。

Namespace-awareな`from` expressionとcross-thought loadingは後続要求を必要とする。その将来追加では、
Coreへstorage/network authorityを付与せず、authorization済みprepared runtimeをCoreが評価する境界を
維持しなければならない。

## 11. V1共存とmigration

1. 既存V1 parsing、formatting、auditing、help、examples、DSLQL、storage、public adapterは利用可能な
   ままとし、現行の既定動作を維持する。
2. V2は明示選択を必要とする。V2のinstallまたはenableによってV1 sourceやthought storeを書き換えては
   ならない。
3. Migrationはread-only check形と明示的output形を持つ。

   ```text
   llmthink migrate input.think --to 2 --profile reasoning@2.0.0 --check
   llmthink migrate input.think --to 2 --profile reasoning@2.0.0 --out output.think
   ```

4. MigrationはV1 parserでparseし、型付きmigration model経由で変換し、V2 formatterで出力する。
   text置換を正規transformとして使用してはならない。
5. V1の`based_on problem`はV2の`addresses` linkへ写像する。それ以外のV1 `based_on`参照は保守的に
   `basis_for`へ写像し、`supports`を推定してはならない。
6. Statement source orderを維持しながらstep wrapperを除去する。Comparison、partition、annotation、
   raw axis変換は明示的な型付きmappingに従う。
7. Ambiguous scope、identity collision、unsupported role/property、非等価DSLQL、情報損失は、source span、
   理由、修正候補付きでfail closedとする。暗黙にlossyなoutputを生成してはならない。
8. 同じV1 bytes、profile bytes、optionでmigrationを反復した場合、同一V2 bytesを生成する。
9. Thought-store migrationは、revisionとdigestのreadbackを伴う、別の明示実行されるcopy-preserving
   operationとする。Document migrationの受入はstore migrationを認可しない。
10. V1 compatibility readerはmigration境界で使用できるが、V2 runtime内部の隠れたV1分岐にしては
    ならない。

## 12. Trustとfailure境界

- Profile resolutionはcaller-suppliedまたはpackage-bundledで、digest検証を行う。
- Coreはprofileをdownloadせず、document locatorを辿らない。
- External resourceは、別途認可されたresolverが検証済みcontentを供給しない限りstructural metadataの
  ままとする。
- Unknown profile、unsupported contract version、invalid constraint、digest mismatch、resource
  exhaustion、required provider unavailableは、異なるmachine-readable codeでfail closedとする。
- Node、link、operation、nesting、constraint、traversal depth、query resultのlimitは明示inputとし、rawの
  truncationまたはfailure metadataへ反映する。
- Profileはfilesystem、network、repository、namespace、credential、persistence、finalization、approval、
  release、deployment authorityを付与できない。

## 13. 受入基準

R1は、受入済み候補snapshotに対して次のすべてが実証された場合だけ満たされる。

1. V2文書は明示的な`think <profile>@<version>` headerを必要とし、headerなしの現行V1 fixtureは変更されない
   V1 pathを使用する。
2. Core parserはuse-case固有分岐を持たず、normalized V2 collectionだけを出力する。
3. 既存closed operatorを使うfixture-only profile追加ではparserまたはCore IR schema変更を必要としない。
4. 単純なproblem/evidence/decision文書を空行を除く10 source line未満で記述できる。
5. Goalなしexploration、goal-directed decision、derive、combine、split、partition、crossを同じcore
   grammarで表現できる。
6. Profile identity/version/digest mismatchはfail closedとなり、raw machine-readable outputへ現れる。
7. `basis_for`、`supports`、`stimulus_for`は異なる宣言relationのままとし、embeddingやshared referenceから
   いずれも推定しない。
8. Derived/combined/split/partition provenanceを、手書きderived stateなしでoperationからqueryできる。
9. 同じfixtureのseverityがprofile contractどおりloose/guided/strictで変化し、syntax、identity、reference、
   digest failureを弱めない。
10. Raw finding内のsource-backed targetがすべて個別spanを持つ。
11. CLI、Core、stdio MCP、Hosted Application Service、LSP、VSIX conformance fixtureが、rule ID、severity、
    target reference、span、message identityで一致する。
12. Semantic-provider unavailableを明示し、semantic queryを異なるfallback queryへ変更しない。
13. すべての公式V1 exampleがmigration fixtureを持ち、source locationと理由を含むerrorなしに情報を失う
    fixtureが存在しない。
14. 反復migrationがbyte-stableであり、inputを上書きせずthought storeを変更しない。
15. 完全な既存V1 corpusとpublic-surface fixtureで、暗黙のgrammar、AST、audit、help、storage、
    finalization、public-name変更がない。
16. 悪意あるprofile fixtureがcode実行、network/filesystem/storage access、未知constraint operator追加を
    行えない。
17. Raw audit outputはlosslessのままとし、presentation truncation時は総数とtruncationを報告する。
18. 別途受入がない限り、namespace、release、package publication、deployment、V1 cutoverが実装change
    setに含まれない。

## 14. 非目標

- V1の置換、非推奨化、削除
- V2の自動選択またはV1の自動migration
- 命題の真偽、evidence strength、causal validity、goal achievement、MECE truth、orthogonalityの判定
- 実行可能またはremote loadされるprofile
- namespace resolution、ACL、OAuth、cross-thought loading、hosted scope expression、Coreの直接I/O
- 撤回済みsemantic-audit artifactの復活
- Hosted MCP contract V1またはroot compatibility surfaceの変更
- release、publication、deployment、production activation、Issue mutation
- 本generic contractの受入だけを根拠とする、RCA Profile R1を含むspecialized profileの受入

## 15. 前提と未解決判断

- R1は`reasoning@2.0.0`を最初の同梱profileと仮定する。実際のprofile bytesとdigestは本要求textでは
  なく、本contract後にreviewする実装artifactである。
- Profile dataの正確なJSON Schemaとwire layoutはdesign artifactとして未確定だが、意味やoperatorを
  追加せず、上記closed contract全体を実装しなければならない。
- Namespace-aware queryは後続revision向けに未決定のまま残す。R1はIssue #25の広い案を受入も拒否も
  しない。
- Package/repository配置、release version、activation、V1 retirementは別のオーナー判断として残る。

## 16. Step 1自己レビュー

- Source provenanceと後発オーナー方針を明示した。
- V1と受入済みHosted/public contractを黙ってsupersedeせず維持した。
- 外部V2 selector、profile identity、digest、closed constraint、audit boundary、migration failure、
  受入基準を規範的に記述した。
- Namespace scopeその他の将来案を受入blockerにしていない。
- 既存実装は実現可能性の証拠としてのみ使用した。
- この候補はdesign、ADR作成、implementation、migration、release、deployment、acceptanceを認可しない。
