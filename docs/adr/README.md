# Architecture Decision Records

ADR の作成規則は [ADR ルール](../process/adr-rules.md) を参照する。

| ADR                                                                  | Status   | Decision                                                                          |
| -------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------- |
| [0001](0001-thought-audit-engine.md)                                 | accepted | エンジンを思考監査エンジンとして定義する                                          |
| [0002](0002-audit-severity-model.md)                                 | accepted | 監査重大度モデルを fatal error warning info hint に固定する                       |
| [0003](0003-mece-as-structural-discipline.md)                        | accepted | MECE を真理判定ではなく記述規律として扱う                                         |
| [0004](0004-unified-interface-architecture.md)                       | accepted | CLI MCP VSIX を共通監査 API に統一する                                            |
| [0005](0005-preview-graph-layout-engine.md)                          | accepted | VSIX preview graph の layout engine に ELK を採用する                             |
| [0006](0006-public-license-model.md)                                 | accepted | Public repository のライセンスは MPL-2.0 を採用する                               |
| [0007](0007-server-application-boundary.md)                          | proposed | Hosted server は共通 Application Service を公開する                               |
| [0008](0008-thought-repository-and-file-consistency.md)              | proposed | Thought 永続化を Repository Port と revision 契約で分離する                       |
| [0009](0009-hosted-interfaces-and-plugin-trust-boundary.md)          | proposed | REST、HTTP MCP、Plugin を同一 service の独立 adapter とする                       |
| [0010](0010-managed-oauth-identity-boundary.md)                      | accepted | managed OAuth identity と llmthink 認可を分離する                                 |
| [0011](0011-trial-self-service-provisioning-and-terms-acceptance.md) | accepted | 試験利用者を規約同意後に専用 tenant へ自動登録する                                |
| [0012](0012-sqlite-lifecycle-control-plane-boundary.md)              | accepted | account registry と tenant catalog を論理分離した SQLite control plane を採用する |
| [0013](0013-cloudflare-r2-backup-storage.md)                         | accepted | 初期 off-ConoHa backup storage に Cloudflare R2 Standard を採用する               |
| [0014](0014-restic-operational-version.md)                           | accepted | 初期運用版として restic 0.19.1 を固定する                                         |
| [0015](0015-rational-confidence-interval-propagation.md)             | accepted | 信頼度を有理数区間と認識状態で伝搬する                                            |
