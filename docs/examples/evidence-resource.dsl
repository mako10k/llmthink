problem P1:
  "公開仕様の根拠を追跡可能にする"

evidence EV1:
  "公開仕様とローカル検証記録が設計判断を裏付ける"
  resource:
    url "https://example.test/specification.pdf"
    digest "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    mime "application/pdf"
    label "公開仕様"
  resource:
    file "evidence/verification.txt"
    mime "text/plain"
    label "ローカル検証記録"

decision D1 based_on P1, EV1:
  "evidence 本文と resource provenance を分離して保持する"

query Q1:
  .document.steps[].statement | select(.id == @EV1) | .resources[]
