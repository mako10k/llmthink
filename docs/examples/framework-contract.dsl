framework DecisionAudit:
  requires problem
  requires premise or evidence
  requires decision
  forbids decision_without_reference
  warns pending_after_strong_decision