# UI アーキテクチャ仕様

## 1. 目的

本書は、思考監査エンジンを 3 つの利用形態で提供するための UI アーキテクチャを定義する。

対象 UI は次の 3 つである。

- MCP サーバ
- VSIX 経由のツール提供
- CLI

---

## 2. 設計原則

- 監査ロジックは 1 か所に集約する
- UI 層では意味を変えず、入出力と表示だけを担当する
- CLI、MCP、VSIX の間で監査結果の整合性を保つ
- 入口ごとの操作体験は最適化してよい

---

## 3. 共通構造

```text
           +---------------------+
           |   Core Audit API    |
           | auditText/auditFile |
           +----------+----------+
                      |
        +-------------+-------------+
        |             |             |
      CLI        MCP stdio       VSIX
```

共通コアは次の責務を持つ。

- DSL テキストのパース
- 監査結果の生成
- JSON 形式の監査レポート返却

UI 層は次の責務を持つ。

- 入力取得
- 実行トリガ
- 表示整形
- 利用環境ごとのエラーハンドリング

---

## 4. CLI 仕様

### 4.1 目的

CLI はローカル開発、CI、バッチ監査の入口とする。

### 4.2 最小コマンド

- llmthink audit <file>
- llmthink audit --text <dsl>
- llmthink audit <file> --pretty

### 4.3 表示方針

- デフォルトは JSON
- pretty 指定時は人間向けの要約表示

### 4.4 期待体験

- 単一ファイルをすぐ監査できる
- CI では JSON をそのまま扱える

---

## 5. MCP サーバ仕様

### 5.1 目的

MCP サーバは、外部の LLM クライアントから思考監査エンジンを利用するための入口とする。

### 5.2 transport

- stdio

### 5.3 提供ツール

- audit_text
- audit_file

### 5.4 ツール戻り値

- 人間可読な要約テキスト
- JSON 文字列化した監査結果

### 5.5 制約

- ツールは共通 API を呼ぶだけに留める
- 監査結果の意味を UI 層で変更しない

---

## 6. VSIX 仕様

### 6.1 目的

VSIX は、編集中の DSL ドキュメントを即座に監査するための入口とする。

### 6.2 最小機能

- active editor のテキストを監査する command
- 監査結果を webview に表示する
- output channel に JSON を出力する

### 6.3 将来拡張

- diagnostics 反映
- 保存時自動監査
- code action

### 6.4 最小 command

- LLMThink: Audit Active Document
- LLMThink: Show Last Audit Report

---

## 7. 実装配置

### 7.1 root package

- src/analyzer
- src/parser
- src/model
- src/cli.ts
- src/mcp/server.ts

### 7.2 VSIX extension package

- vscode-extension/package.json
- vscode-extension/src/extension.ts
- vscode-extension/tsconfig.json

VSIX 拡張は root package を依存として使う。

---

## 8. 検証方針

- root package は typecheck、build、examples 回帰確認を通す
- MCP サーバは起動確認と tool 登録確認を行う
- VSIX 拡張は typecheck とビルド確認を行う

---

## 9. 非目標

- ブラウザ Web UI の追加
- 複数ファイルのワークスペース横断監査
- リアルタイムストリーミング解析