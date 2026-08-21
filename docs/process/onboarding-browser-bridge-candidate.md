# Onboarding browser bridge candidate

- Status: implemented and tested locally; not deployed
- Date: 2026-08-21
- External effects: none

## Boundary

An OAuth-valid identity that has no active lifecycle account cannot receive a normal MCP
`RequestContext`. Instead, it receives an MCP surface containing only
`begin_llmthink_onboarding`. Thought, audit, history, search, and persistence tools are not
registered in that connection.

Calling the bridge tool does not record agreement or create an account, tenant, workspace,
recovery credential, or thought. It creates a random 256-bit, identity-bound, ten-minute,
single-use ticket and returns a same-origin URL with the ticket in the fragment.

## Browser exchange

URL fragments are not transmitted in the HTTP request, Referer, or ordinary reverse-proxy access
line. The public bootstrap page loads a fixed same-origin script under a restrictive CSP. That
script:

1. reads the ticket from the fragment;
2. immediately removes the fragment from browser history;
3. sends the ticket once in a same-origin POST body;
4. replaces the bootstrap page with the exact versioned terms response.

The server consumes the ticket before rendering. It replaces it with the existing identity-bound,
single-use nonce and `Secure`, `HttpOnly`, `SameSite=Strict` CSRF cookie. The final explicit
agreement POST therefore contains neither the WorkOS bearer token nor the bridge ticket. Replay,
expiry, wrong origin, missing CSRF, another identity, artifact replacement, and capacity overflow
fail closed.

## Remaining gate

Deployment is separate. After deploying an exact revision, use the already OAuth-authenticated
`llmthink_trial` client to list tools and verify it sees only `begin_llmthink_onboarding`. Issuing a
ticket is reversible and does not itself agree. Opening the link displays documents. Pressing the
agreement button creates the first live account and tenant and therefore remains an explicit owner
action.
