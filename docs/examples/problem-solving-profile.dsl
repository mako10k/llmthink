framework ProblemSolvingProfile:
  requires problem and decision
  requires premise and evidence
  warns pending

domain ProblemSolving:
  description "課題解決・問題解決の最小 role を示す代表例"

problem P1:
  "nightly build failure をどう止めるか"

step S1:
  premise PR1:
    "失敗は CI 上で安定して再現する"

step S2:
  evidence EV1:
    "ログでは dependency install 後に timeout が集中している"

step S3:
  decision D1 based_on P1, PR1, EV1:
    "dependency cache invalidation を最初の対処として試す"

step S4:
  pending PD1:
    "cache 変更で改善しない場合は network mirror を比較する"

query Q1:
  .steps[] | select(.role == "decision" and len(.based_on) > 0)