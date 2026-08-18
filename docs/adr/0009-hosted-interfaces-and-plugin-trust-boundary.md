# ADR-0009: REST、HTTP MCP、Plugin を同一 service の独立 adapter とする

## Status

proposed

## Date

2026-08-18

## Context

- hosted llmthink は一般 client 向け API と LLM client 向け MCP の両方を必要とする
- 現行 MCP は stdio transport と `dsl`、`thought` の action dispatch tool を提供する
- ChatGPT Plugin は Streamable HTTP MCP tool、Skills、任意 UI を組み合わせられる
- Skills と tool description は model の選択を助けるが、必ず実行される security boundary ではない
- audit だけを要求した呼び出しが暗黙に thought を保存すると、read と write の区別が曖昧になる

## Decision

REST API、Streamable HTTP MCP、stdio MCP を同一 Application Service の独立 adapter とし、Plugin と Skills はその外側の client integration とする。

- REST は versioned `/api/v1` JSON API とする
- Streamable HTTP MCP は `/mcp` で提供し、stdio MCP はローカル互換として維持する
- MCP tool は `audit_thought`、`create_thought_draft`、`get_thought`、`list_thoughts`、`search_thoughts`、`finalize_thought`、`add_thought_reflection`、`get_thought_history` のように user goal 単位で定義する
- pure audit と audit record 保存を異なる use case と tool に分ける
- read、write、consequential write の annotation を tool metadata に持たせる
- delete は初期 hosted MCP の公開 tool に含めない
- Skills は authoring、audit、reflection の手順を提供するが、認証、認可、tenant 分離、validation、confirmation を担わない
- write と finalize の認可、revision、idempotency、confirmation token は server が検査する
- 初期 HTTP stack は Node `http` と MCP SDK の Node 用 `StreamableHTTPServerTransport` とし、追加 framework を導入しない
- optional MCP UI は tool と machine-readable result の受入後に別判断で追加する

## Alternatives Considered

- 現行の `dsl`、`thought` action dispatch tool を HTTP へそのまま公開する
  - 後方互換性は高いが、tool selection と read/write annotation が action 値に埋もれるため hosted tool としては不採用
- Skills に write confirmation と操作制限を記述する
  - model behavior の改善にはなるが、迂回可能で enforcement にならないため不採用
- 最初から custom UI を必須にする
  - graph 表示には有益だが、tool contract と認可の検証を遅らせるため不採用
- audit API を常に thought store へ自動登録する
  - 現行 workflow と近いが、pure validation を行う client に意図しない write を発生させるため不採用

## Consequences

- 現行 stdio MCP tool と hosted MCP tool の名前は当面異なる
- tool metadata と Skills の変更時に tool-selection evaluation が必要になる
- pure audit は read-only に扱えるが、外部 provider を使う semantic audit の cost と privacy は別途示す必要がある
- Plugin が誤った tool を選択しても server の policy enforcement は維持される
- optional UI のない初期 Plugin は結果表示能力が限定される
- routing、body limit、timeout、error mapping は framework に委ねず llmthink adapter が明示的に実装する必要がある

## Auditability Notes

- tool selection evaluation で action dispatch の方が明確と判明した場合に tool 粒度を再評価する
- Skills の有無で authorization result が変わった場合は security defect とする
- pure audit が永続化または外部 I/O を行うよう変更される場合に再判断する
- custom UI が必要な use case と model-readable result だけで足りる use case を分けて評価する
