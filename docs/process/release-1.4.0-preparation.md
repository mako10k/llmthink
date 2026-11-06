# 1.4.0 release candidate preparation

Status: locally verified candidate; not published.
Date: 2026-11-06

## Owner agreement

「はい。個別公開方式でリリース準備を進めてください。実際の公開はまだ行わないでください。」

Namespace follow-up: 「@mako10k のパッケージ名へ変更して準備する」

Prepare @mako10k/llmthink-core, @mako10k/llmthink-contracts,
@mako10k/llmthink-server and llmthink at 1.4.0, plus VSIX 1.4.0.
ADR-0025 records the distribution decision. Hosted MCP wire contract remains V1 with
the existing canonical surface/schema hashes. Root exports and bins are retained.
No new runtime permission, configuration prerequisite, gate or default refusal was added.

## Candidate source and artifacts

The source candidate is prepared on codex/causal-relations, based on verified origin/main
8cce0d9812f4d1841e2c26c96c29ed6982bb34c9. No main merge, tag, push, npm publication,
GitHub Release, hosted deployment or consumer update is performed during preparation.
The final candidate commit and artifact digests are recorded in the external release receipt;
this avoids a source-commit self-reference. Artifacts remain tied to their exact packed source bytes.

Artifacts:

- mako10k-llmthink-core-1.4.0.tgz
- mako10k-llmthink-contracts-1.4.0.tgz
- mako10k-llmthink-server-1.4.0.tgz
- llmthink-1.4.0.tgz
- llmthink-1.4.0.vsix

The source is ready for later main integration/review. These are unpublished candidate
artifacts, not claims that v1.4.0 exists on npm or GitHub. Published root remains 1.3.0.

## Verification

- All 292 tests passed: Core 132, Contracts 11, root conformance 17, Server 67, application 65.
- Root build, extension build/typecheck, lint, format, deadcode and example verification passed.
- A clean source copy completed npm ci and build; its locally installed declared perttool
  dependency passed all plan checks. No global perttool fallback was needed for that copy.
- A disposable loopback registry served only the four candidate tarballs and proxied public
  dependency reads. Installing llmthink@1.4.0 alone resolved the exact three @mako10k dependencies.
  This is an install test fixture, not publication or evidence that registry versions exist.
- The installed root public exports, Hosted application export, Contracts conformance verification,
  CLI audit and all bin files were checked outside the checkout. No workspace links were used.
- The npm-created CLI symlink now resolves its bundled sample catalog. A release install probe
  exposed the prior symlink lookup defect; real executable-path resolution fixes it without
  changing old DSL/audit semantics. A regression checks this consumer entrypoint.
- Four tarballs were checked for exact candidate source bytes, license files, public metadata,
  exact inter-package versions and independent SHA-512 integrity.
- VSIX manifest/version/README and runtime/editor payload match source; no local editor was replaced.
- Existing stale example JSON fixtures were regenerated for current raw report metadata and 1.4.0.
  Their previous differences predated this candidate; error/fatal counts did not disappear.
  Removed weak hints agree with the already verified runtime baseline.
- A redacted lexical scan covered the working source and all 2,604 blobs reachable from local refs.
  The selected private-key/token patterns found no matches. This is not exhaustive secret detection.
- Standard Server runtime remains Node >=24.15.0 and <25.0.0. Validation used Node 24.19.0;
  preview tests used the already installed Chromium. No new product runtime restriction was added.

## Registry observations

npm authentication succeeded as mako10k after the owner logged in.
Read-only npm access reported read-write for llmthink.
The initial @llmthink organization lookup returned Scope not found, leading to the explicit
@mako10k name choice. Rights/MFA/token validity and version availability must be re-read when
actual publication is requested. No organizational or account configuration was changed.

## Eventual publication and rollout

Use the frozen tarballs in order: Core -> Contracts -> Server -> root, then publish the matching
VSIX release asset. The existing release checklist records source/tag/readback procedures.
Do not substitute freshly regenerated assets for the verified candidate artifacts.

After publication, separately plan:

- Stable WSL and Insiders extension updates, with editor reload and selected external/bundled LSP checks.
- Bot submodule update from its old 5990447 revision, with the Bot's actual Node/MCP/reconnect path checked.
- Hosted deployment and a real remote audit, then Plugin compatibility evidence refresh.
- Public npm/GitHub version, digest, source and install readback.

These rollout operations have not been performed or silently treated as part of preparation.

## Final package/source reconciliation

Inspection found an ignored dist/config directory with no current src/config owner, while
the root files declaration included the whole dist tree. TypeScript rebuilds did not delete
the earlier output after its source moved to Core. The old public exports do not expose that
subpath and current root imports do not use it. It is now excluded from the root tarball.
The required Hosted bin wrapper has an existing committed TypeScript owner; its generated
JS/map/declaration are tracked with this candidate. These are packaging corrections, not
new runtime controls or removal of public root APIs.
The earlier 73feeff source preparation commit is retained in history; the external receipt
identifies the corrected candidate source. No earlier candidate was published or tagged.
