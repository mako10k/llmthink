# Architecture Decision Records

ADR の作成規則は [ADR ルール](../process/adr-rules.md) を参照する。

| ADR                                                               | Status   | Decision                                                         |
| ----------------------------------------------------------------- | -------- | ---------------------------------------------------------------- |
| [0001](0001-thought-audit-engine.md)                              | accepted | エンジンを思考監査エンジンとして定義する                         |
| [0002](0002-audit-severity-model.md)                              | accepted | 監査重大度モデルを fatal error warning info hint に固定する      |
| [0003](0003-mece-as-structural-discipline.md)                     | accepted | MECE を真理判定ではなく記述規律として扱う                        |
| [0004](0004-unified-interface-architecture.md)                    | accepted | CLI MCP VSIX を共通監査 API に統一する                           |
| [0005](0005-preview-graph-layout-engine.md)                       | accepted | VSIX preview graph の layout engine に ELK を採用する            |
| [0006](0006-public-license-model.md)                              | accepted | Public repository のライセンスは MPL-2.0 を採用する              |
| [0007](0007-server-application-boundary.md)                       | proposed | Hosted server は共通 Application Service を公開する              |
| [0008](0008-thought-repository-and-file-consistency.md)           | proposed | Thought 永続化を Repository Port と revision 契約で分離する      |
| [0009](0009-hosted-interfaces-and-plugin-trust-boundary.md)       | proposed | REST、HTTP MCP、Plugin を同一 service の独立 adapter とする      |
| [0015](0015-rational-confidence-interval-propagation.md)          | accepted | 信頼度を有理数区間と認識状態で伝搬する                           |
| [0016](0016-evidence-resource-semantic-boundary.md)               | accepted | Evidence resourceをsemantic inputへ暗黙昇格させない              |
| [0017](0017-core-workspace-and-test-boundary.md)                  | accepted | Coreを独立workspaceとテスト境界にする                            |
| [0018](0018-versioned-contract-and-conformance-boundary.md)       | accepted | Versioned contractとsource-independent Conformance Kitを採用する |
| [0019](0019-staged-server-workspace-and-live-contract-binding.md) | accepted | Hosted serverをworkspaceへ抽出しlive contractを結合する          |
| [0021](0021-shared-hosted-contract-and-root-compatibility.md)     | accepted | Hosted共有契約とroot互換面を分けて段階移行する                   |

ADR-0020はPR #38で追加されたが、decision ownerが確認していない配布・互換判断を
acceptedとしていたためPR #39でrevertした。監査上の識別子を別判断へ再利用しない。
