# ADR-0025: Individual npm package distribution

Status: Accepted
Date: 2026-11-06
Decision owner: user

## Context and agreement

ADR-0021 preserves source ownership and the public root Hosted exports/bin while leaving
distribution unresolved. Its rejected root re-bundling alternative is not being revived.

Owner source:
「はい。個別公開方式でリリース準備を進めてください。実際の公開はまだ行わないでください。」

Interpretation: prepare four independently installable npm packages and the VSIX, preserving
existing root exports/bins. Actual publication, push, tag creation, merging, Hosted deployment,
Plugin updates and other consumer installations are not part of this preparation.

## Decision

- Prepare @mako10k/llmthink-core, @mako10k/llmthink-contracts, @mako10k/llmthink-server and llmthink for individual
  public npm distribution. Remove private from Contracts/Server and declare public access.
- Candidate version is 1.4.0 across all packages, stdio MCP and VSIX. Pin exact inter-package
  dependencies. Hosted MCP wire contract remains V1.
- Eventual publication order: Core -> Contracts -> Server -> root -> VSIX release asset.
- Keep source/test responsibility boundaries and existing root facade/bin.
- Retain existing Server Node requirements; introduce no new runtime permissions, holds,
  allowlists or configuration prerequisites.
- This resolves the previous private-dependency distribution choice. It does not authorize
  actual publication or claim that local artifact testing establishes registry publishing rights.

## Claims and evidence

C1: Individual packages preserve source ownership and root behavior.
E1: Root references Server through its facade; Server imports Contracts and Core.
C2: Public dependencies resolve the previously unresolvable private-workspace install path.
E2: Exact manifest dependencies, artifact inspection and isolated clean-install tests.
C3: Minor 1.4.0 fits the additive DSL/editor capability.
E3: docs/process/version-bump-rules.dsl D3 and legacy behavior regression evidence.

## Alternatives

Root re-bundling was not selected. Removing root exports/bins would break consumers.
Publishing root alone cannot resolve unpublished dependencies. Publication may be deferred
without disabling the already delivered local tools.

## Consequences and recovery

Contracts/Server become public distribution units requiring documentation, licensing,
artifact inspection and install/readback. Package-name rights must be checked before publication.
No published artifact is modified during preparation. Existing new-version correction policy
continues to apply; no new automatic runtime enforcement is introduced.

## Review and implementation

Synchronize manifests, lockfiles, constants, assertions, examples and candidate notes.
Verify artifacts outside the checkout without workspace symlinks. Distinguish artifact success,
registry visibility, publishing rights and hosted rollout.

## Follow-ups

Main integration and publication are later owner actions. Hosted Plugin/server rollout,
Insiders and the Bot submodule remain separate consumers with runtime/restart state unverified.

## npm namespace decision

Owner answer after the @llmthink scope lookup returned Scope not found:
「@mako10k のパッケージ名へ変更して準備する」

The three selected names are @mako10k/llmthink-core, @mako10k/llmthink-contracts and
@mako10k/llmthink-server. Root remains llmthink. Existing installed snapshots are unchanged.
This replaces the initial candidate names, not the Hosted MCP wire contract or its artifact hashes.
