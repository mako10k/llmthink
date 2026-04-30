domain ThoughtReflectFeature:
  description "reflect 機能の設計整合性を確認する"

problem ReflectWorkflow:
  "reflect を thought の軽量追記として追加する"

step S1:
  premise P1:
    "reflect は新しい thought ではなく既存 thought への付記である"

step S2:
  premise P2:
    "CLI と MCP と VS Code 拡張は同じ action 名と view 名を優先する"

step S3:
  premise P3:
    "reflect は append-only とし、初期実装では更新削除を持たない"

step S4:
  decision D1 based_on P1, P2:
    "thought reflect を追加し、show reflections で一覧表示する"

step S5:
  decision D2 based_on P1, P3:
    "reflect は note concern decision follow_up audit_response の kind を持つ"

step S6:
  decision D3 based_on P1, P3:
    "reflect 追加は history に記録し updated_at を更新するが status は変えない"

step S7:
  pending N1:
    "reflect の検索対象化や編集削除は将来検討とする"