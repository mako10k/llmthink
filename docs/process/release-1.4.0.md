# 1.4.0 publication

Date: 2026-11-06

Owner publication instruction: 「では、公開い進みましょう」, following the verified
1.4.0 help/navigation replacement candidate. This advances the prior preparation-only scope
to the existing release checklist: public main/tag, four npm packages, GitHub Release with VSIX.
It does not deploy Hosted, update Plugins/Bot/editors, change repository visibility or publish
an extension to VS Code Marketplace.

The release source updates candidate notices to final version/download URLs and records the
matching generated VSIX. The preceding cd1cf9b code and behavior are retained. Since README
is packed, this is a new final artifact set; the previous unpublished candidate is not reused
as if its README matched the final source. The external publication receipt freezes the
complete source SHA, tarball integrities, VSIX hash, exact release notes and publication results.

Targets: github.com/mako10k/llmthink main and annotated v1.4.0; registry.npmjs.org public latest
@mako10k/llmthink-core, @mako10k/llmthink-contracts, @mako10k/llmthink-server, llmthink at 1.4.0;
GitHub Release v1.4.0 with llmthink-1.4.0.vsix. Expected logical writes are one atomic main/tag
push, one publish per tarball and one release creation with asset upload. Each is followed by
remote readback. An ambiguous result is investigated read-only before any further write.
Published npm versions, tags and assets are retained; corrections use a subsequent patch release.
This records this release operation and does not add runtime controls to the product.
