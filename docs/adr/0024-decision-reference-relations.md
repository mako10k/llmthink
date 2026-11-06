# ADR-0024: Separate support and action references with optional relation details

Status: Accepted
Date: 2026-11-06
Decision owner: user

## Context

The owner wants analysis of phenomena, causes, their distinct impact chains, and measures
addressing those impacts. Numerous dedicated syntax primitives were rejected in favor of an
additive extension of existing reference syntax.

## Decision

Keep based_on for support, add acts_on for targets, and attach qualified relation blocks.
Use existing statements/annotations, a role annotation and explicitly selected built-in
causal-impact-v1 audit. The normative contract is
[decision-relations.md](../specs/decision-relations.md).

## Claim and evidence

- C1: Distinct reference families preserve support semantics.
  Evidence: owner-requested separation; no action target enters based_on or confidence.
- C2: Optional syntax and opt-in profile preserve old-document behavior.
  Evidence required: baseline corpus comparison and compatibility regressions.
- C3: A structural graph cannot certify causal truth or effectiveness.
  Evidence: declared edges are author assertions; no external observations are acquired.
- Authority: user source wording and its interpretation are retained verbatim in the contract.
  “OK。仕様として固めて、実装を進めてください。” authorizes this specification and implementation.

## Alternatives

Dedicated cause/impact/measure syntax adds unnecessary primitives. Encoding action targets in
based_on conflates support with intervention. Alias-only expansion into legacy references loses
the relation semantics needed for structural audit.

## Consequences and implementation notes

Core owns parsing, validation, profile and DSLQL projections; adapters share the same report.
Legacy absence is preserved in AST/JSON. No new logical solver, execution authority, external
semantic-review service or automatic completion gate is introduced.
The separately preserved Generic V2 R2 and RCA R4 work remains unchanged; this ADR neither
claims to implement that runtime nor accepts its unresolved RCA requirements.

## Review

Review obligation: verify role and relation scope, unknown handling, support-only confidence,
formatter/storage round trips, public surface parity, legacy baseline and evidence limits.
Passing structure is not owner acceptance, semantic truth or deployment authorization.

## Follow-ups

Future alias/macro design and conversion for old executables are separate work.
Release, installation, merge, publication and deployment require their own authority.
