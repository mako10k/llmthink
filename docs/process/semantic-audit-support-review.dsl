domain SemanticAuditSupport:
  description "思考の意味監査補助機能について、annotation、対象列挙、CLI 追記の責務分離をゼロベースで整理する"

problem P1:
  "現在の audit は構文・参照・局所整合性を確認できるが、evidence E1 が decision D1 の根拠として妥当かのような意味レベルの確認は支援していない"

problem P2:
  "意味監査を人手や LLM で実施しても、その結果が DSL 本体に残らなければ、どの根拠関係を確認済みかを再読時に判別しにくい"

problem P3:
  "監査対象を自由入力に任せると、どの pair を見落としたか分からず、監査 coverage を運用で保証しにくい"

problem P4:
  "annotation だけで意味監査結果を持たせると、statement 単位の注釈と edge 単位の判定が混ざり、E1-D1 のような対象を機械可読に特定しにくい"

problem P5:
  "質問文は locale に応じて自然言語化したいが、locale ごとに意味監査の対象や識別子まで変わると CLI と保存形式が不安定になる"

step S1:
  premise PR1:
    "この機能の目的は真偽を自動確定することではなく、意味監査の対象列挙、実施記録、再読性を改善することである"

step S2:
  premise PR2:
    "第一段階の監査対象は、decision の based_on に現れる explicit edge から機械的に列挙できるものへ限定したほうが説明可能である"

step S3:
  premise PR3:
    "locale は prompt の表現にだけ影響し、監査対象 id や保存される構造の意味は locale 非依存であるべきである"

step S4:
  premise PR4:
    "将来の再監査や人手レビューを考えると、意味監査結果は上書き専用より append 可能な記録として扱ったほうが運用しやすい"

step S5:
  evidence EV1:
    "既存 DSL では decision が based_on で problem、premise、evidence、viewpoint を参照しており、少なくとも explicit support pair は抽出できる"

step S6:
  evidence EV2:
    "既存 annotation は statement や problem に付く設計であり、E1-D1 のような pair 自体を第一級の対象として保持する構造ではない"

step S7:
  evidence EV3:
    "ユーザーが求めている例は E1-D1 のような pair id と、判断文・証拠文を含む locale-aware な質問文生成である"

step S8:
  evidence EV4:
    "CLI には thought audit、reflect、history など追記系の入口があり、意味監査の記録もコマンド化する余地がある"

step S9:
  decision D1 based_on P1, PR1, PR2, EV1, EV3:
    "意味監査補助機能の最小単位は statement 単体ではなく、decision とその根拠候補の explicit pair として扱う"

step S10:
  decision D2 based_on P3, D1, PR2, EV1:
    "第一段階で列挙する監査対象は、decision の based_on に含まれる evidence と premise を優先し、problem に対しては別種の問いとして後続検討に分ける"

step S11:
  decision D3 based_on P5, D1, PR3, EV3:
    "監査対象の stable id は E1-D1 のような locale 非依存の pair id とし、表示用 prompt は locale に応じて自然言語化する"

step S12:
  decision D4 based_on P3, PR1, PR3, EV4, D2, D3:
    "CLI はまず未監査 pair の列挙と prompt 生成を担い、その次に pair id、verdict、reason を受けて DSL へ結果を追記する二段階フローに分ける"

step S13:
  decision D5 based_on P2, P4, PR1, PR4, EV2:
    "意味監査の正式な保存形式は annotation 単独ではなく、pair id、verdict、reason、timestamp などを持てる専用 statement または同等の第一級構造として設計する"

step S14:
  decision D6 based_on P2, P4, D5:
    "annotation を導入する場合は、専用構造が存在することを前提に、statement 上へ '意味監査済みの要約表示' を与える補助ラベルに留める"

step S15:
  decision D7 based_on P5, D2, D3, D4:
    "locale-aware な質問文の初期形は、pair id、判断 text、根拠 text を埋めた定型文テンプレートとして実装し、意味監査ロジック自体は locale に依存させない"

step S16:
  pending PD1:
    "pair に対する保存構造を新しい statement role にするか、annotation を拡張して半構造化 payload を持たせるかは、parser 差分と query 性能を見て再判断が必要である"

step S17:
  pending PD2:
    "verdict を true or false の二値にするか、unknown や mixed を含む閉じた集合にするかは、実際の監査フローを見て決める必要がある"

step S18:
  pending PD3:
    "problem や viewpoint を prompt へどこまで同梱するかは、短さと誤読防止のバランスを見て調整が必要である"

step S19:
  pending PD4:
    "意味監査結果を本体 DSL に追記するだけで十分か、thought history や別 report にも残すべきかは、差分可読性と検索性を見て再判断が必要である"

problem P6:
  "意味監査結果の正本をどこへ置くかで、diff の読みやすさ、merge 競合、CLI 自動追記のしやすさが大きく変わる"

problem P7:
  "本体 DSL に追記すると議論と監査ログが同居して再読性は上がるが、append が増えるほど本文が膨らみやすい"

problem P8:
  "別ファイル化すると監査ログの追記はしやすいが、本体と分離されるため参照規約と discoverability を設計しないと運用が崩れやすい"

problem P9:
  "DSL 外の history や store だけに残す方式は本文汚染を避けられるが、Git diff や repo grep だけでは監査結果を追いにくい"

step S20:
  premise PR5:
    "運用上の正本は、append-heavy な更新でも競合を局所化でき、かつ repo 内レビューで追跡できる形が望ましい"

step S21:
  premise PR6:
    "意味監査は一度きりではなく、verdict の更新、理由の差し替え、再監査の追記が起こりうる"

step S22:
  premise PR7:
    "本体 DSL は思考の構造を短く再読するための面であり、監査ログは時系列 append に寄りやすい"

step S23:
  evidence EV5:
    "人手レビューでも LLM 補助でも、pair ごとの verdict と理由は回数を重ねて増えるため、statement 本文よりログ列に近い運用になる"

step S24:
  evidence EV6:
    "Git 上で同一ファイル末尾への append を複数人が行うと、意味的衝突がなくても mechanical conflict が起きやすい"

step S25:
  evidence EV7:
    "repo 内の sidecar file なら、CLI が構造化追記しやすく、PR diff でも監査追加だけを独立にレビューしやすい"

step S26:
  evidence EV8:
    "DSL 外 store のみを正本にすると、clone 直後の repo だけでは監査状態が完結せず、エディタやコードレビューで文脈が切れやすい"

step S27:
  viewpoint VP1:
    axis collaboration

step S28:
  viewpoint VP2:
    axis portability

step S29:
  viewpoint VP3:
    axis automation

step S30:
  decision D8 based_on P6, P7, PR5, PR6, PR7:
    "案A: 意味監査結果の正本を本体 DSL に append する"

step S31:
  decision D9 based_on P6, P8, PR5, PR6, PR7:
    "案B: 意味監査結果の正本を thought ごとの sidecar file に append し、本体 DSL とは別に管理する"

step S32:
  decision D10 based_on P6, P9, PR5, PR6:
    "案C: 意味監査結果の正本を DSL 外の history/store にだけ残す"

step S33:
  comparison CMP1 on P6 viewpoint VP1 relation preferred_over D9, D8:
    "共同編集と append-heavy 運用では sidecar file の方が mechanical conflict を局所化しやすい"

step S34:
  comparison CMP2 on P6 viewpoint VP2 relation preferred_over D8, D10:
    "repo 単体での再読性と持ち運びやすさでは本体 DSL 追記の方が外部 store 専用より優れる"

step S35:
  comparison CMP3 on P6 viewpoint VP3 relation preferred_over D9, D10:
    "CLI からの構造化追記、再監査、一覧化では sidecar file の方が外部 store 専用より扱いやすい"

step S36:
  decision D11 based_on P7, PR6, PR7, EV5, EV6, D8:
    "案A は監査件数が少ない初期導入や最終スナップショットには向くが、継続運用の正本としては本文肥大化と競合の面で弱い"

step S37:
  decision D12 based_on P8, PR5, PR6, EV5, EV6, EV7, D9:
    "案B は append-heavy な監査運用、PR レビュー、再監査履歴の保持を両立しやすく、継続運用の正本候補として最も安定している"

step S38:
  decision D13 based_on P9, PR5, EV8, D10:
    "案C は内部実装として併用する余地はあるが、利用者が repo だけ見ても監査状態を理解できないため正本にはしない"

step S39:
  decision D14 based_on P2, P6, PR4, PR5, D6, D12, D13:
    "運用方針としては sidecar file を意味監査結果の正本とし、本体 DSL には要約 annotation または生成ビューだけを置く hybrid を第一候補にする"

step S40:
  decision D15 based_on PR4, PR5, EV7, D12:
    "sidecar file の形式は JSON ではなく DSL とし、人手レビュー、差分確認、必要時の手修正をしやすくする"

step S41:
  decision D16 based_on PR5, PR7, EV7, D12, D15:
    "sidecar DSL の正本配置は .llmthink/thoughts/<thought-id>/semantic-audit.dsl を第一候補とし、draft.dsl や final.dsl に隣接させて discoverability を上げる"

step S42:
  decision D17 based_on PR4, PR6, PR7, D14, D16:
    "時系列の再監査履歴や実行ログが必要な場合は、semantic-audit.dsl を正本としつつ、派生履歴を .llmthink/thoughts/<thought-id>/semantic-audits/ 配下へ追加保存する構成にする"

problem P10:
  "本体 DSL に出す要約は、常時固定だと運用ごとのノイズ許容量に合わず、軽い確認と厳密な追跡の両方を満たしにくい"

step S44:
  premise PR8:
    "要約は正本ではなく運用向けの表示面として扱い、チームやフェーズに応じて粒度を切り替えられるほうがよい"

step S45:
  evidence EV9:
    "日常運用では『監査済みかどうか』だけ見えれば十分な場面と、pair ごとの最新 verdict まで見たい場面が分かれる"

step S46:
  decision D18 based_on P10, PR8, EV9, D14:
    "本体 DSL 側の要約は固定 1 種にせず、none、document_summary、pair_summary のような運用プロファイルから選べるようにする"

step S47:
  decision D19 based_on PR8, EV9, D18:
    "既定値は document_summary とし、本文には『この thought に意味監査記録がある』ことと最新更新時刻、未解決件数など document 単位の短い要約だけを出す"

step S48:
  decision D20 based_on PR8, D18:
    "pair_summary はレビューや集中的な検証で使う運用モードとし、対象 pair id、最新 verdict、短い reason を本文または生成ビューへ展開できるようにする"

step S49:
  decision D21 based_on PR8, D18:
    "none は本文ノイズを最小化したい運用モードとして許可し、その場合も sidecar DSL 自体は必ず残して CLI と preview から到達できるようにする"

step S50:
  pending PD5:
    "semantic-audit.dsl の具体文法を既存 statement role の組み合わせで表すか、semantic_audit のような専用 role を導入するかは parser 差分を見て再判断が必要である"

step S51:
  pending PD6:
    "document_summary と pair_summary の切替を annotation 生成で行うか、preview や thought show の生成ビューで行うかは UI 面と diff 面を見て決める必要がある"

step S52:
  pending PD7:
    "semantic-audits/ 配下に置く派生履歴を append-only DSL にするか、timestamp ごとの snapshot DSL にするかは merge 競合と追跡性を見て調整が必要である"
