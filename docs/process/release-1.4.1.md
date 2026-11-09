# 1.4.1 publication

Date: 2026-11-09
Owner instruction: 「では、公開手続きを進めてください。」, following the verified Node 22
compatibility candidate. This authorizes the existing release checklist's main/tag push, four
individual npm publications and GitHub Release with VSIX. Installed-client updates, Hosted
rollout and Marketplace publication remain separate operations.

The runtime implementation and validation scope are recorded in ADR-0026 and
[node22-client-runtime-validation.md](node22-client-runtime-validation.md). The implementation
PERT ends at verified compatibility; publication progress/readback is recorded in the external
release receipt so source and tag do not need a post-publication rewrite.

Publish version 1.4.1, tag v1.4.1, to public github.com/mako10k/llmthink and registry.npmjs.org.
Targets, in dependency order: @mako10k/llmthink-core, @mako10k/llmthink-contracts,
@mako10k/llmthink-server, llmthink. All use public access and latest. GitHub Release includes
llmthink-1.4.1.vsix and the matching CHANGELOG section.

Final README/CHANGELOG notices replace candidate language and refer to 1.4.1 URLs before the
final VSIX and tarballs are generated. Runtime code remains the verified Node 22 correction.
The external receipt freezes the complete source SHA, four tarball integrities, VSIX hash and
release notes. Planned logical writes: one atomic main/tag push, four package publications and
one GitHub Release creation with asset upload. Results are read back before completion;
authentication errors or ambiguous outcomes are investigated without blindly resubmitting.
Published versions, tags and assets are retained; later corrections use a new patch release.
