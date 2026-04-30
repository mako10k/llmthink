# Thought Reflect 機能設計

## 1. 目的

reflect は既存 thought に対する軽量な追記を永続化する機能である。

draft や final の本文を直接書き換えずに、次を残せるようにする。

- 監査結果に対する応答
- 後から見つかった懸念点
- 小さな意思決定メモ
- 後続タスクの明示

reflect は新しい thought を増やす機能ではない。既存 thought に従属する append-only な付記として扱う。

## 2. 設計方針

### 2.1 UI/UX 原則

- 対称性: thought の既存ライフサイクルに沿って CLI / MCP / VS Code 拡張の全入口で扱えること
- 網羅性: 追加、一覧表示、要約への反映、履歴への反映を揃えること
- 一貫性: 命名は thought reflect に統一し、related thought のような別概念と混同しないこと
- 単純性: reflect 自体に別ライフサイクルを持たせず、編集や削除は初期スコープに含めないこと

### 2.2 スコープ

今回実装するのは次のみとする。

- thought への reflect 追加
- reflect の永続化
- thought summary への最新 reflect 件数と最新種別の反映
- thought history への reflect 追加イベント表示
- thought show で reflect 一覧表示
- CLI / MCP / VS Code 拡張からの reflect 実行導線

今回実装しないものは次とする。

- reflect の更新
- reflect の削除
- reflect 単体検索
- reflect への返信スレッド
- reflect 単位の監査

## 3. データモデル

thought 配下に reflections.json を追加する。

想定パス:

- .llmthink/thoughts/<thought-id>/reflections.json

reflect は次の構造を持つ。

```ts
type ThoughtReflectionKind =
  | "note"
  | "concern"
  | "decision"
  | "follow_up"
  | "audit_response";

interface ThoughtReflection {
  id: string;
  at: string;
  kind: ThoughtReflectionKind;
  text: string;
}
```

設計判断:

- id は thought 内で一意なら十分なので timestamp ベースで生成する
- kind は自由文字列にせず enum に限定する
- text は短文前提だが長さ制限は初期実装では設けない
- reflections.json は配列を丸ごと保存する単純構成にする

## 4. コマンド設計

### 4.1 CLI

追加する subcommand は次とする。

- llmthink thought reflect --id <thought-id> --text "..." [--kind note]

追加する表示 view は次とする。

- llmthink thought show --id <thought-id> reflections

thought history は既存コマンドのまま reflect 記録を含める。

### 4.2 MCP

thought tool の action に reflect を追加する。

- action=reflect
- thoughtId 必須
- text 必須
- kind は任意で既定値 note

thought tool の view に reflections を追加する。

- view=summary|draft|final|audit|reflections

show view に reflections を追加する。

### 4.3 VS Code 拡張

追加コマンドは次とする。

- LLMThink: Thought Reflect

フローは次とする。

1. thought-id を入力
2. quick pick で reflect kind を選択する。既定選択は note とする
3. reflect text を入力
4. output channel に更新後 summary を表示

thought history と thought show の reflect 表示は store / presentation の更新で自然に反映させる。

## 5. 表示設計

### 5.1 Summary

summary に次の行を追加する。

- reflection_count: 件数
- latest_reflection_kind: 最新 kind または -

### 5.2 History

reflect 追加時は history に reflect_recorded を追記する。

summary 例:

- reflect を追加した。kind=concern

reflect は個別ファイルを持たないため、history event の path は付与しない。

### 5.3 Reflections View

thought show reflections は時系列昇順で次を表示する。

- timestamp
- kind
- text

空の場合は No reflections yet. を返す。

## 6. 整合性ルール

- reflect は thought が未作成でも追加可能とする。内部では ensureThoughtRecord を使う
- reflect の追加は thought の updated_at を更新する
- reflect 追加は status を変更しない
- reflect は draft/final の内容を変更しない
- reflect は derived_from を変更しない
- reflect は history に必ず記録される

## 7. 実装方針

### 7.1 store

- ThoughtReflectionKind と ThoughtReflection を追加
- ThoughtEventKind に reflect_recorded を追加
- ThoughtSnapshot に reflections を追加
- reflections.json の read / write helper を追加
- addThoughtReflection 関数を追加

### 7.2 presentation

- formatThoughtSummary に reflect 情報を追加
- formatThoughtReflections を追加
- formatThoughtHistory は reflect_recorded を既存 event と同様に扱う

### 7.3 public API

- index.ts から addThoughtReflection, ThoughtReflection, ThoughtReflectionKind を export する

### 7.4 CLI / MCP / VS Code 拡張

- thought reflect を対称に追加
- show reflections view を対称に追加
- help / usage / command manifest を更新

## 8. 評価観点

- 既存 thought のライフサイクルを壊さずに追記できるか
- related thought を作るべき場面と reflect で足りる場面が分離できているか
- CLI / MCP / VS Code 拡張で同じ mental model を維持できているか
- history と summary だけでも recent context が追えるか

## 9. リリース判断

この機能は 0.2.x のパッチではなく、UI surface と永続化スキーマを増やすため 0.3.0 扱いが妥当とする。
