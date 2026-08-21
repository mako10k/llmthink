# explicit onboarding and re-consent implementation evidence

- Status: completed locally
- Date: 2026-08-21
- PERT task: `IMPLEMENT_ONBOARDING`
- External effects: none

## Implemented boundary

- Added an authenticated same-origin `/onboarding` GET and `/onboarding/agree` POST surface that
  can be mounted on the hosted MCP HTTP server without granting normal MCP access first.
- Kept onboarding authentication separate from registered-account `RequestContext` resolution.
  A verified external OAuth identity may view and accept documents, but login alone does not create
  an account, tenant, workspace, agreement receipt, or llmthink authorization.
- Displays the active Japanese trial terms, important summary, and Privacy Notice with their exact
  versions, effective date, and SHA-256 identities.
- Uses a cryptographically random, identity-bound, single-use, ten-minute server-side nonce plus a
  `Secure`, `HttpOnly`, `SameSite=Strict` CSRF cookie and exact Origin check.
- Rechecks every artifact identity immediately before agreement. A retired, replaced, missing, or
  altered artifact returns a conflict and requires a fresh review.
- On the first explicit POST, uses the existing serialized SQLite lifecycle transaction to record
  agreement, create one account and one tenant/workspace pair, bind the fixed scope policy, enqueue
  realization, and show the recovery credential once.
- For an account in `reconsent_required`, the same surface records an exact new receipt and restores
  normal account state only after a fresh explicit POST.
- Added MCP authentication guidance stating that login, connection, and link display are not
  agreement and identifying the stable same-origin `/onboarding` path.

## Fail-closed evidence

Focused tests cover:

- absent onboarding authentication;
- missing or wrong Origin;
- missing or mismatched CSRF cookie;
- another authenticated identity attempting to use the nonce;
- hidden artifact-field alteration;
- nonce replay and expiry;
- terms replacement between GET and POST;
- duplicate provisioning prevention;
- material-change re-consent;
- Japanese language metadata, responsive viewport, headings, keyboard-scrollable document regions,
  and explicit action text.

The full repository suite passed 214 tests with one intentionally skipped real-restic integration
test. TypeScript typecheck, build, focused ESLint, and handwritten-file Prettier checks passed.

## Remaining authority and operational boundaries

This implementation is not configured in `hosted-main`, deployed, published, or activated. It does
not create Production SQLite terms rows, OAuth credentials, WorkOS resources, users, or public
enrollment. Runtime configuration, exact provider-side external-identity authentication, immutable
terms-row activation, workspace realization, Stage acceptance, and Production/public activation
remain separate tasks and owner gates.

Onboarding sessions are deliberately in-memory and restart-invalidated. They are not an authority
store; the SQLite artifact and agreement receipt remain authoritative. A restart requires the user
to open the page and review the current exact artifacts again.
