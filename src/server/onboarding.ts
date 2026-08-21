import { randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { LlmthinkExternalOAuthIdentity } from "./oauth-jwt.js";
import {
  type ActiveTermsArtifact,
  SqliteLifecycleStore,
  TRIAL_AGREEMENT_ACTION_VERSION,
} from "./sqlite-lifecycle-store.js";

const DEFAULT_NONCE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_SESSIONS = 1_000;
const MAX_FORM_BYTES = 16 * 1024;
const SESSION_COOKIE = "llmthink_onboarding_csrf";

export interface OnboardingPrincipal {
  readonly identity: LlmthinkExternalOAuthIdentity;
  readonly requestId: string;
}

export type LlmthinkOnboardingAuthenticator = (
  request: IncomingMessage,
) => Promise<OnboardingPrincipal>;

export type LlmthinkOnboardingHttpHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<boolean>;

export interface LlmthinkOnboardingOptions {
  readonly store: SqliteLifecycleStore;
  readonly authenticate: LlmthinkOnboardingAuthenticator;
  readonly publicOrigin: string;
  readonly termsId: string;
  readonly privacyNoticeId: string;
  readonly scopePolicyId: string;
  readonly now?: () => number;
  readonly entropy?: (bytes: number) => Buffer;
  readonly nonceTtlMs?: number;
  readonly maxSessions?: number;
}

interface OnboardingSession {
  readonly identityKey: string;
  readonly csrf: string;
  readonly expiresAt: number;
  readonly termsId: string;
  readonly version: string;
  readonly contentSha256: string;
  readonly summarySha256: string;
  readonly privacyNoticeId: string;
  readonly privacyVersion: string;
  readonly privacySha256: string;
}

function exactOrigin(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.origin !== value
  ) {
    throw new Error("Onboarding public origin must be an exact HTTPS origin");
  }
  return value;
}

function identityKey(identity: LlmthinkExternalOAuthIdentity): string {
  return `${identity.issuer}\u0000${identity.subjectId}\u0000${identity.organizationId ?? ""}`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}

function cookieValue(request: IncomingMessage): string | undefined {
  const raw = request.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === SESSION_COOKIE) return value.join("=");
  }
  return undefined;
}

function equalSecret(left: string | undefined, right: string): boolean {
  if (!left) return false;
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

async function readForm(request: IncomingMessage): Promise<URLSearchParams> {
  const contentType = request.headers["content-type"] ?? "";
  if (
    !contentType.toLowerCase().startsWith("application/x-www-form-urlencoded")
  ) {
    throw new Error("invalid_form");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_FORM_BYTES) throw new Error("invalid_form");
    chunks.push(buffer);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

function securityHeaders(response: ServerResponse): void {
  response.setHeader("cache-control", "no-store");
  response.setHeader(
    "content-security-policy",
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  );
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-frame-options", "DENY");
}

function sendHtml(
  response: ServerResponse,
  status: number,
  body: string,
): void {
  securityHeaders(response);
  response.statusCode = status;
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(body);
}

function page(
  terms: ActiveTermsArtifact,
  privacy: ActiveTermsArtifact,
  nonce: string,
  mode: "agree" | "reconsent",
): string {
  const action =
    mode === "reconsent" ? "再同意する" : "同意して試験利用を開始する";
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>llmthink 試験利用への同意</title><style>body{font-family:system-ui,sans-serif;line-height:1.6;max-width:72rem;margin:2rem auto;padding:0 1rem}pre{white-space:pre-wrap;border:1px solid #bbb;padding:1rem;max-height:30rem;overflow:auto}button{font:inherit;padding:.7rem 1rem}dl{display:grid;grid-template-columns:max-content 1fr;gap:.25rem 1rem}</style></head>
<body><main><h1>llmthink 試験利用への同意</h1><p>ログインだけでは同意になりません。以下の文書を確認し、同意する場合だけボタンを押してください。</p>
<dl><dt>規約version</dt><dd>${escapeHtml(terms.version)}</dd><dt>発効日</dt><dd>${escapeHtml(terms.effectiveAt)}</dd><dt>本文 SHA-256</dt><dd><code>${terms.contentSha256}</code></dd><dt>要約 SHA-256</dt><dd><code>${terms.summarySha256}</code></dd><dt>Privacy Notice version</dt><dd>${escapeHtml(privacy.version)}</dd><dt>Privacy Notice SHA-256</dt><dd><code>${privacy.contentSha256}</code></dd></dl>
<h2>重要事項要約</h2><pre tabindex="0">${escapeHtml(terms.summary)}</pre><h2>試験利用規約</h2><pre tabindex="0">${escapeHtml(terms.content)}</pre><h2>Privacy Notice</h2><pre tabindex="0">${escapeHtml(privacy.content)}</pre>
<form method="post" action="/onboarding/agree"><input type="hidden" name="nonce" value="${nonce}"><input type="hidden" name="terms_id" value="${escapeHtml(terms.termsId)}"><input type="hidden" name="terms_version" value="${escapeHtml(terms.version)}"><input type="hidden" name="content_sha256" value="${terms.contentSha256}"><input type="hidden" name="summary_sha256" value="${terms.summarySha256}"><input type="hidden" name="privacy_id" value="${escapeHtml(privacy.termsId)}"><input type="hidden" name="privacy_version" value="${escapeHtml(privacy.version)}"><input type="hidden" name="privacy_sha256" value="${privacy.contentSha256}"><button type="submit">${action}</button></form></main></body></html>`;
}

function resultPage(title: string, detail: string): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p></main></body></html>`;
}

interface OnboardingRuntime {
  readonly options: LlmthinkOnboardingOptions;
  readonly origin: string;
  readonly now: () => number;
  readonly entropy: (bytes: number) => Buffer;
  readonly ttl: number;
  readonly maxSessions: number;
  readonly sessions: Map<string, OnboardingSession>;
}

function cleanSessions(runtime: OnboardingRuntime): void {
  const timestamp = runtime.now();
  for (const [nonce, session] of runtime.sessions) {
    if (session.expiresAt <= timestamp) runtime.sessions.delete(nonce);
  }
}

async function authenticateOnboarding(
  runtime: OnboardingRuntime,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<OnboardingPrincipal | undefined> {
  try {
    return await runtime.options.authenticate(request);
  } catch {
    sendHtml(
      response,
      401,
      resultPage("認証が必要です", "ログインしてから再度お試しください。"),
    );
    return undefined;
  }
}

function issueSession(
  runtime: OnboardingRuntime,
  principal: OnboardingPrincipal,
  terms: ActiveTermsArtifact,
  privacy: ActiveTermsArtifact,
): { readonly nonce: string; readonly csrf: string } {
  const nonce = runtime.entropy(32).toString("base64url");
  const csrf = runtime.entropy(32).toString("base64url");
  runtime.sessions.set(nonce, {
    identityKey: identityKey(principal.identity),
    csrf,
    expiresAt: runtime.now() + runtime.ttl,
    termsId: terms.termsId,
    version: terms.version,
    contentSha256: terms.contentSha256,
    summarySha256: terms.summarySha256,
    privacyNoticeId: privacy.termsId,
    privacyVersion: privacy.version,
    privacySha256: privacy.contentSha256,
  });
  return { nonce, csrf };
}

function handleOnboardingGet(
  runtime: OnboardingRuntime,
  principal: OnboardingPrincipal,
  response: ServerResponse,
): void {
  cleanSessions(runtime);
  if (runtime.sessions.size >= runtime.maxSessions) {
    sendHtml(
      response,
      503,
      resultPage("現在利用できません", "しばらくしてから再度お試しください。"),
    );
    return;
  }
  const state = runtime.options.store.onboardingAccountState(
    principal.identity,
  );
  if (state === "active") {
    sendHtml(
      response,
      200,
      resultPage("同意済みです", "llmthinkを利用できます。"),
    );
    return;
  }
  if (state === "unavailable") {
    sendHtml(
      response,
      403,
      resultPage("利用できません", "問い合わせ先へご連絡ください。"),
    );
    return;
  }
  const terms = runtime.options.store.activeTermsArtifact(
    runtime.options.termsId,
  );
  const privacy = runtime.options.store.activeTermsArtifact(
    runtime.options.privacyNoticeId,
    "privacy_notice",
  );
  const issued = issueSession(runtime, principal, terms, privacy);
  response.setHeader(
    "set-cookie",
    `${SESSION_COOKIE}=${issued.csrf}; Path=/onboarding; Max-Age=${Math.floor(runtime.ttl / 1000)}; Secure; HttpOnly; SameSite=Strict`,
  );
  sendHtml(
    response,
    200,
    page(
      terms,
      privacy,
      issued.nonce,
      state === "reconsent_required" ? "reconsent" : "agree",
    ),
  );
}

function sessionMatches(
  runtime: OnboardingRuntime,
  request: IncomingMessage,
  principal: OnboardingPrincipal,
  form: URLSearchParams,
  session: OnboardingSession | undefined,
): session is OnboardingSession {
  if (!session) return false;
  const expected = [
    [form.get("terms_id"), session.termsId],
    [form.get("terms_version"), session.version],
    [form.get("content_sha256"), session.contentSha256],
    [form.get("summary_sha256"), session.summarySha256],
    [form.get("privacy_id"), session.privacyNoticeId],
    [form.get("privacy_version"), session.privacyVersion],
    [form.get("privacy_sha256"), session.privacySha256],
  ];
  return (
    session.expiresAt > runtime.now() &&
    session.identityKey === identityKey(principal.identity) &&
    equalSecret(cookieValue(request), session.csrf) &&
    expected.every(([actual, value]) => actual === value)
  );
}

function artifactsMatch(
  terms: ActiveTermsArtifact,
  privacy: ActiveTermsArtifact,
  session: OnboardingSession,
): boolean {
  return [
    terms.version === session.version,
    terms.contentSha256 === session.contentSha256,
    terms.summarySha256 === session.summarySha256,
    privacy.version === session.privacyVersion,
    privacy.contentSha256 === session.privacySha256,
  ].every(Boolean);
}

async function handleOnboardingPost(
  runtime: OnboardingRuntime,
  request: IncomingMessage,
  principal: OnboardingPrincipal,
  response: ServerResponse,
): Promise<void> {
  if (request.headers.origin !== runtime.origin)
    throw new Error("invalid_form");
  const form = await readForm(request);
  const nonce = form.get("nonce") ?? "";
  const session = runtime.sessions.get(nonce);
  runtime.sessions.delete(nonce);
  if (!sessionMatches(runtime, request, principal, form, session))
    throw new Error("invalid_form");
  let terms: ActiveTermsArtifact;
  let privacy: ActiveTermsArtifact;
  try {
    terms = runtime.options.store.activeTermsArtifact(session.termsId);
    privacy = runtime.options.store.activeTermsArtifact(
      session.privacyNoticeId,
      "privacy_notice",
    );
  } catch {
    sendHtml(
      response,
      409,
      resultPage("規約が更新されました", "内容を再確認してください。"),
    );
    return;
  }
  if (!artifactsMatch(terms, privacy, session)) {
    sendHtml(
      response,
      409,
      resultPage("規約が更新されました", "内容を再確認してください。"),
    );
    return;
  }
  const state = runtime.options.store.onboardingAccountState(
    principal.identity,
  );
  if (state === "reconsent_required") {
    runtime.options.store.recordReconsent(
      principal.identity,
      session.termsId,
      TRIAL_AGREEMENT_ACTION_VERSION,
    );
    sendHtml(
      response,
      200,
      resultPage("再同意が完了しました", "llmthinkを再び利用できます。"),
    );
    return;
  }
  if (state !== "unregistered") throw new Error("invalid_form");
  const provisioned = runtime.options.store.provisionTrialAccount({
    identity: principal.identity,
    termsId: session.termsId,
    scopePolicyId: runtime.options.scopePolicyId,
    actionVersion: TRIAL_AGREEMENT_ACTION_VERSION,
  });
  sendHtml(
    response,
    201,
    resultPage(
      "試験利用を開始できます",
      `復旧識別子は一度だけ表示されます: ${provisioned.recoveryCredential ?? "既に発行済みです"}`,
    ),
  );
}

export function createLlmthinkOnboardingHandler(
  options: LlmthinkOnboardingOptions,
): LlmthinkOnboardingHttpHandler {
  const runtime: OnboardingRuntime = {
    options,
    origin: exactOrigin(options.publicOrigin),
    now: options.now ?? Date.now,
    entropy: options.entropy ?? randomBytes,
    ttl: options.nonceTtlMs ?? DEFAULT_NONCE_TTL_MS,
    maxSessions: options.maxSessions ?? DEFAULT_MAX_SESSIONS,
    sessions: new Map(),
  };
  if (
    !Number.isSafeInteger(runtime.ttl) ||
    runtime.ttl < 1_000 ||
    !Number.isSafeInteger(runtime.maxSessions) ||
    runtime.maxSessions < 1
  ) {
    throw new Error("Onboarding session bounds are invalid");
  }
  return async (request, response) => {
    const pathname = new URL(request.url ?? "/", runtime.origin).pathname;
    if (pathname !== "/onboarding" && pathname !== "/onboarding/agree")
      return false;
    const principal = await authenticateOnboarding(runtime, request, response);
    if (!principal) return true;
    try {
      if (request.method === "GET" && pathname === "/onboarding") {
        handleOnboardingGet(runtime, principal, response);
      } else if (
        request.method === "POST" &&
        pathname === "/onboarding/agree"
      ) {
        await handleOnboardingPost(runtime, request, principal, response);
      } else {
        throw new Error("invalid_form");
      }
    } catch {
      sendHtml(
        response,
        400,
        resultPage(
          "手続を完了できません",
          "ページを開き直して、内容を再確認してください。",
        ),
      );
    }
    return true;
  };
}
