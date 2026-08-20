# ADR-0010: managed OAuth identity と llmthink 認可を分離する

## Status

accepted

## Date

2026-08-20

## Context

- hosted llmthink の Streamable HTTP MCP は現在、単一の静的 Bearer token
  から固定 subject、tenant、workspace、scope を生成している
- 配布する Plugin と Codex からは、secret を埋め込まず Authorization Code with
  PKCE で利用者ごとの identity を確立する必要がある
- MCP authorization は resource server metadata、authorization server metadata、
  `resource` parameter、PKCE、access token の issuer/audience 検証を要求する
- OpenAI の ChatGPT と Codex は CIMD と DCR をサポートするが、callback と CIMD
  document は surface ごとに異なる
- WorkOS AuthKit は MCP authorization server、CIMD、DCR、PKCE、refresh token、
  Resource Indicator、JWT/JWKS を提供し、access token の `aud` を requested
  resource に束縛できる
- WorkOS の公開 access-token contract は `sub` と任意の `org_id` を identity
  claim として示す一方、`thought:read` など llmthink 固有の authorization scope
  claim は示していない
- Google は AuthKit の upstream social login として使用できるが、Google の
  access token や password は llmthink に渡さない
- ADR-0007 と ADR-0009 により、identity、tenant/workspace 分離、scope、revision、
  idempotency、confirmation は server-side enforcement であり、Plugin、Skill、
  tool argument から変更できない

## Decision

WorkOS AuthKit を hosted llmthink の managed OAuth authorization server 候補とし、
Google を優先 upstream login とする。production contract は次の境界で固定する。

### Protocol contract

- resource server は `https://llmthink.mk10.org/mcp` とする。末尾 slash を付けず、
  protected-resource metadata の `resource`、OAuth の `resource` parameter、JWT の
  expected `aud` で同じ文字列を使用する
- issuer は Stage/Production ごとに異なる AuthKit custom domain の exact HTTPS
  origin とし、末尾 slash、case、port を正規化せず完全一致で検査する
- resource server は RFC 9728 protected-resource metadata と 401 response の
  `WWW-Authenticate: Bearer resource_metadata=...` challenge を提供する
- authorization server metadata は Authorization Code、PKCE `S256`、refresh
  token、CIMD または DCR、Resource Indicator を公開しなければならない
- client registration は CIMD を優先し、AuthKit で CIMD を明示的に有効化する。
  ChatGPT と Codex の metadata document、redirect URI、token endpoint auth method
  は同一と仮定せず、各 client の実値を Stage acceptance で記録する
- access token は header の Bearer token としてのみ受け付け、query、cookie、tool
  argument からは受け付けない
- resource server は signature、algorithm allowlist、`kid`、exact `iss`、exact
  `aud`、`exp`、`nbf`、`iat`、`sub`、任意の `org_id` を検査する。JWKS は bounded
  cache と未知 `kid` に対する一回の refresh を用い、取得不能時は fail closed とする
- refresh token、authorization code、ID token、Google credential は client と
  AuthKit の境界に留め、llmthink は保存・記録しない

### Account and authorization mapping

- AuthKit `sub` は login identity の不変外部キーとして扱う。email、display name、
  Google subject から tenant/workspace を導出しない
- `org_id` がある場合もそれ自体を llmthink tenant ID として直接採用せず、
  `(issuer, sub, org_id)` を server-side account registry の有効な mapping に解決する
- registry は `subjectId`、`tenantId`、`workspaceId`、llmthink scopes、状態、mapping
  revision を返す。未登録、無効、曖昧、別 issuer の組は拒否する
- tenant は hosted llmthink の hard isolation boundary とし、project、scope、tool
  argument、account mapping のいずれによっても横断を許可しない
- project による workspace 横断は、同一 tenant 内で server-side project grant を
  正しく検証できた場合に限って許可する。membership、grant revision、対象 workspace
  または認可結果を検証できない場合は横断しない
- llmthink scopes は `thought:read`、`thought:write`、`thought:finalize`、`audit:run`
  の server-side grant とする。WorkOS/OIDC scope や tool argument を llmthink scope
  へ暗黙変換しない
- OAuth scope は `openid email profile offline_access` を login/refresh 用に使用する。
  email を利用する場合は verified email の表示・運用確認に限り、authorization key
  にはしない
- account linking は自動 email match を禁止する。同じ利用者の provider link または
  mapping 変更は、既存 subject で再認証した operator action と監査記録を必要とする
- operator break-glass は distributable Plugin から参照できない migration-only static
  token adapter とし、固定 tenant/workspace/scopes、明示的な有効期限、利用監査、撤去条件
  を持たせる

### Stage acceptance gate

provider contract を accepted にする前に、secret-free な Stage evidence で次を確認する。

- AuthKit metadata の issuer、endpoints、S256、CIMD/DCR、refresh、JWKS
- configured Resource Indicator と発行 JWT の `aud` 完全一致
- ChatGPT と Codex の初回 login、callback、refresh、再認証、logout/revocation
- unknown `kid` rotation、expired/not-yet-valid token、wrong issuer/audience の拒否
- 同一 account の永続 mapping と、cross-account、cross-tenant、cross-workspace の拒否
- Google login の `sub` 安定性と verified-email 表示。ただし email による自動 link はしない
- WorkOS が ChatGPT/Codex の CIMD または DCR を client secret の Plugin 埋込みなしで
  受理すること

Stage 検証前に resource discovery と token verifier をローカル実装してよいが、Stage
provider resource 作成、DNS、Google Cloud consent、credential 作成、production 切替は
それぞれ明示的な外部変更承認を必要とする。

## Alternatives Considered

- Google OAuth を MCP authorization server として直接使用する
  - MCP protected-resource discovery、CIMD/DCR、Resource Indicator、ChatGPT/Codex
    callback を一体で満たす契約が確認できず、Google token と llmthink resource token の
    境界も曖昧になるため不採用
- ChatGPT session authentication を使用する
  - trusted first-party server 向けであり、独立した llmthink resource の identity として
    利用可能とは扱えないため不採用
- WorkOS access token の `sub` または `org_id` をそのまま llmthink storage key にする
  - provider lifecycle と内部 resource identity が結合し、workspace と scope を安全に
    表現できないため不採用
- email address を account key として自動 link する
  - email 変更、provider 間衝突、誤 link により account boundary が拡大するため不採用
- Plugin に静的 token または OAuth client secret を配布する
  - 利用者単位 identity がなく、secret の回収と rotation が困難なため不採用

## Consequences

- provider の identity lifecycle と llmthink authorization policy を独立して変更できる
- account registry と operator-facing provisioning/recovery 手順が新たに必要になる
- 現行の単一 `workspaceId` RequestContext は、同一 tenant 内の project grant による
  workspace 横断を表現できないため、project authorization は OAuth identity mapping
  とは別の設計・実装を必要とする
- WorkOS の OAuth consent scope と llmthink tool scope は一致しないため、Plugin の
  consent 表示だけを authorization evidence として扱えない
- Stage/Production で issuer と Resource Indicator を別々に管理する必要がある
- JWT の offline signature 検証だけでは即時 revocation を保証できない。短い access-token
  lifetime、refresh-token revocation、必要箇所での introspection の採否を Stage evidence
  で決める
- CIMD transition 中の ChatGPT/Codex callback 差異を acceptance matrix に残す必要がある

## Auditability Notes

- authoritative evidence は MCP authorization specification、OpenAI Authentication と
  Codex MCP documentation、WorkOS AuthKit MCP/Connect documentation、Stage metadata
  readback とする
- WorkOS access token に llmthink 固有 scope を安全に発行できる契約が追加された場合、
  server-side grant との役割分担を再判断する
- WorkOS が exact Resource Indicator、CIMD/DCR、public-client PKCE、JWKS rotation の
  いずれかを満たさない場合は AuthKit 採用を中止する
- email、Google subject、tool argument、Skill text が tenant/workspace/scope を変更したら
  security defect とする
- static-token rollback path の期限超過、Plugin からの参照、無監査利用を migration defect
  とする
- `think://<server-identity>/<path>`、server 間参照、MCP 以外の公開 API identity、
  tenant を越える公開・共有・委任権限は本 ADR の非目標とする。これらは要件、脅威モデル、
  authority、revocation、privacy を別途決定するまで検討・設計・実装を開始しない
- 本 ADR の identity・authorization 境界は 2026-08-20 に owner が明示承認した。
  WorkOS は仮採用であり、provider contract の確定、外部設定、Stage acceptance、
  Production activation はこの承認に含まれない
