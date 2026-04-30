# 実施計画

## 1. 目的

本計画は、思考記述 DSL と思考監査エンジンを TypeScript で実装するための進行管理文書である。

この文書は固定計画ではなく、進捗を反映しながら更新する作業台帳として扱う。

---

## 2. 現在地

- 要求仕様は存在する
- ADR-0001 から ADR-0003 までは確定済み
- 監査結果スキーマは存在する
- DSL サンプルは存在する
- TypeScript の最小実装は開始済み

---

## 3. フェーズ

### Phase 1: 仕様固定

- ADR-0003 を作成する
- DSL 構文仕様を作成する
- 監査ルール仕様を作成する
- 必要なら requirements を追補する

### Phase 2: TypeScript 基盤

- package.json を作成する
- tsconfig を作成する
- src 配下の基本構造を作る
- build と typecheck を通す

### Phase 3: 最小実装

- AST 型を定義する
- 診断型を定義する
- 最小 parser を作る
- semantic analyzer を作る
- audit engine の骨格を作る

### Phase 4: サンプル駆動検証

- examples の .dsl を入力に使う
- 期待する監査結果を比較できるようにする
- 代表ケースで回帰確認できるようにする

### Phase 5: UI 提供

- CLI を実用的な操作系として整理する
- MCP サーバを stdio で提供する
- VSIX 拡張を実装する
- 3 つの入口を共通監査 API へ接続する

---

## 4. 進捗

- [x] docs 配下へ文書を整理
- [x] git 初期化
- [x] ADR-0001 を追加
- [x] ADR-0002 を追加
- [x] 監査結果スキーマを追加
- [x] DSL サンプルを追加
- [x] ADR-0003 を追加
- [x] DSL 構文仕様を追加
- [x] 監査ルール仕様を追加
- [x] TypeScript プロジェクトを作成
- [x] AST と診断型を実装
- [x] parser の最小実装
- [x] semantic analyzer の最小実装
- [x] audit engine の最小実装
- [x] examples ベースの検証を追加
- [ ] UI 設計を追加
- [ ] CLI UI を整理
- [ ] MCP stdio サーバを追加
- [ ] VSIX 拡張を追加

直近更新:

- package.json、tsconfig、src 配下の最小実装を追加した
- contradiction-pending.dsl に対して監査 CLI が動作することを確認した
- query-assist.dsl に対して query_result が返ることを確認した
- verify-examples により代表サンプルの期待結果比較を追加した
- 次は CLI、MCP、VSIX の 3 入口を共通 API で揃える

---

## 5. 当面の優先順位

1. DSL の形を固定する
2. 監査ルールを固定する
3. TypeScript の型を先に固定する
4. parser と analyzer を最小実装する
5. examples を検証資産として使う

---

## 6. コミット方針

- 文書仕様の追加ごとにコミットする
- 実装骨格の追加後にコミットする
- typecheck が通る区切りでコミットする
- 大きな未検証差分をためない