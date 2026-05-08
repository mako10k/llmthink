framework StrictRequirements:
  requires problem and decision

domain StrictRequirements:
  description "framework requires の and 条件を検証する"

problem P1:
  "decision を欠く document"
  annotation orphan_reference:
    "framework の requires problem and decision を検証するため、problem を意図的に単独で残している"