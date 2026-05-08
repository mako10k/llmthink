framework IdeationProfile:
  requires problem and decision
  requires premise or evidence
  warns pending

domain Ideation:
  description "発散、収束、クラスタ化、ラベル付けを既存 role で整理する代表例"

problem P1:
  "次の onboarding 改善案をどう収束させるか"

step S1:
  premise PR1:
    "初回 3 分の離脱を減らしたい"

step S2:
  evidence EV1:
    "guided entry を入れた案は初回行動率が高い"

step S3:
  viewpoint VP1:
    axis activation

step S4:
  partition PT1 on Ideation axis activation:
    Guided := guided_entry
    Checklist := checklist_entry
    Sandbox := free_trial_entry
    Others := not Guided and not Checklist and not Sandbox

step S5:
  decision D1 based_on P1, PR1, EV1:
    "guided entry を中心案として収束する"

step S6:
  pending PD1:
    "sandbox 案は次回 backlog 候補として残す"

query Q1:
  .problems[] | select(.id == "P1") | related_decisions