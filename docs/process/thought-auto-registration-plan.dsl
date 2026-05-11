framework ThoughtAutoRegistration:
  requires decision and evidence
  requires problem

domain ThoughtLifecycle:
  description "監査フローへ thought 永続化を自然に組み込む計画"

problem P1:
  "dsl audit と thought audit が分離しすぎていて永続化が日常フローに乗っていない"

problem P2:
  "初回登録で返る ID を以後の修正 再監査 削除に再利用しやすくしたい"

problem P3:
  "CLI MCP VSIX の 3 入口で同じ挙動にそろえたい"

step S1:
  evidence EV1:
    "現状の dsl audit はレポートを返すだけで draft や audit snapshot を保存しない"

step S2:
  evidence EV2:
    "thought audit は保存込みだが dsl audit とは別コマンドで自然導線になっていない"

step S3:
  evidence EV3:
    |
      再利用可能な thought-id が返れば、
      list search show history reflect delete と接続しやすい

step S4:
  decision D1 based_on EV1, EV2:
    "dsl audit を保存込みの標準フローにし、内部で thought draft と audit snapshot を更新する"

step S5:
  decision D2 based_on EV3:
    |
      dsl audit は thought-id を明示されなければ入力ソースから安定した id を導出し、
      結果テキストに thought-id を返す

step S6:
  decision D3 based_on EV3:
    |
      thought draft finalize reflect relate は明示操作として残し、
      再監査 修正 削除は thought-id 指定で行う

step S7:
  decision D4 based_on EV1, EV2, EV3:
    "delete を thought lifecycle に追加し、thought directory を丸ごと削除する"

step S8:
  decision D5 based_on EV1, EV2:
    "監査の保存処理は shared helper に寄せ、CLI MCP VSIX が同じ helper を使う"

query Q1:
  .problems[] | select(.id == "P1") | related_decisions

query Q2:
  .problems[] | select(.id == "P2") | related_decisions

query Q3:
  .problems[] | select(.id == "P3") | related_decisions