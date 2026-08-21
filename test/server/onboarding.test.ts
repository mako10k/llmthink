import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createLlmthinkHostedMcpServer,
  createLlmthinkOnboardingHandler,
  LlmthinkApplicationService,
  LlmthinkServerError,
  ServerFileThoughtRepository,
  SqliteLifecycleStore,
  type LlmthinkExternalOAuthIdentity,
  type RequestContext,
} from "../../src/index.js";

const ORIGIN = "https://llmthink.example";
const TERMS_ID = "trial-terms-ja-v1";
const PRIVACY_ID = "trial-privacy-ja-v2";
const POLICY_ID = "trial-default-v1";

interface Fixture {
  readonly baseUrl: string;
  readonly store: SqliteLifecycleStore;
  readonly close: () => Promise<void>;
}

function identity(subjectId: string): LlmthinkExternalOAuthIdentity {
  return {
    issuer: "https://issuer.example",
    subjectId,
    tokenScopes: ["openid"],
  };
}

function createArtifacts(store: SqliteLifecycleStore): void {
  store.createTermsArtifact({
    termsId: TERMS_ID,
    kind: "trial_terms",
    version: "trial-terms-ja-2026-08-v1",
    locale: "ja-JP",
    effectiveAt: "2026-08-21",
    content: "# 試験利用規約\n\n利用条件です。",
    summary: "# 重要事項\n\n試験サービスです。",
  });
  store.activateTerms(TERMS_ID);
  store.createTermsArtifact({
    termsId: PRIVACY_ID,
    kind: "privacy_notice",
    version: "trial-privacy-ja-2026-08-v2",
    locale: "ja-JP",
    effectiveAt: "2026-08-21",
    content: "# Privacy Notice\n\n取扱方針です。",
    summary: "Privacy Notice",
  });
  store.activateTerms(PRIVACY_ID);
  store.createScopePolicy({
    scopePolicyId: POLICY_ID,
    version: 1,
    scopes: ["thought:read", "thought:write", "thought:finalize", "audit:run"],
  });
}

async function fixture(
  t: test.TestContext,
  options: { readonly now?: () => number } = {},
): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "llmthink-onboarding-"));
  const store = new SqliteLifecycleStore({
    path: join(root, "lifecycle.sqlite"),
  });
  createArtifacts(store);
  let entropyCounter = 0;
  const onboarding = createLlmthinkOnboardingHandler({
    store,
    publicOrigin: ORIGIN,
    termsId: TERMS_ID,
    privacyNoticeId: PRIVACY_ID,
    scopePolicyId: POLICY_ID,
    now: options.now,
    entropy: (bytes) => Buffer.alloc(bytes, ++entropyCounter),
    authenticate: async (request) => {
      const authorization = request.headers.authorization;
      const match = /^Bearer (user-[ab])$/.exec(String(authorization ?? ""));
      if (!match) throw new Error("authentication failed");
      return { identity: identity(match[1]), requestId: "onboarding-request" };
    },
  });
  const application = new LlmthinkApplicationService({
    repository: new ServerFileThoughtRepository({
      dataRoot: join(root, "thoughts"),
    }),
  });
  const server = createLlmthinkHostedMcpServer({
    application,
    onboarding,
    authenticate: async (): Promise<RequestContext> => {
      throw new LlmthinkServerError(
        "unauthenticated",
        "normal API unavailable",
      );
    },
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const close = async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    store.close();
    await rm(root, { recursive: true, force: true });
  };
  t.after(close);
  return { baseUrl, store, close };
}

function auth(subject = "user-a"): Record<string, string> {
  return { authorization: `Bearer ${subject}` };
}

function hiddenFields(html: string): URLSearchParams {
  const values = new URLSearchParams();
  const pattern = /<input type="hidden" name="([^"]+)" value="([^"]*)">/g;
  for (const match of html.matchAll(pattern)) values.set(match[1], match[2]);
  return values;
}

function csrfCookie(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  return setCookie.split(";", 1)[0];
}

async function begin(baseUrl: string, subject = "user-a") {
  const response = await fetch(`${baseUrl}/onboarding`, {
    headers: auth(subject),
  });
  const html = await response.text();
  return {
    response,
    html,
    form: hiddenFields(html),
    cookie: csrfCookie(response),
  };
}

async function agree(
  baseUrl: string,
  form: URLSearchParams,
  cookie: string,
  subject = "user-a",
  origin = ORIGIN,
): Promise<Response> {
  return fetch(`${baseUrl}/onboarding/agree`, {
    method: "POST",
    headers: {
      ...auth(subject),
      origin,
      cookie,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
}

test("onboarding is separately authenticated and renders exact versioned documents accessibly", async (t) => {
  const { baseUrl } = await fixture(t);
  const unauthenticated = await fetch(`${baseUrl}/onboarding`);
  assert.equal(unauthenticated.status, 401);

  const started = await begin(baseUrl);
  assert.equal(started.response.status, 200);
  assert.equal(started.response.headers.get("cache-control"), "no-store");
  assert.match(started.html, /<html lang="ja">/);
  assert.match(started.html, /name="viewport"/);
  assert.match(started.html, /試験利用規約/);
  assert.match(started.html, /Privacy Notice/);
  assert.match(started.html, /ログインだけでは同意になりません/);
  assert.equal(started.form.get("terms_id"), TERMS_ID);
  assert.equal(started.form.get("privacy_id"), PRIVACY_ID);
  assert.match(started.form.get("content_sha256") ?? "", /^[a-f0-9]{64}$/);
});

test("explicit same-origin POST provisions once and consumes its identity-bound nonce", async (t) => {
  const { baseUrl, store } = await fixture(t);
  const started = await begin(baseUrl);
  const response = await agree(baseUrl, started.form, started.cookie);
  const html = await response.text();
  assert.equal(response.status, 201);
  assert.match(html, /試験利用を開始できます/);
  assert.match(html, /llmthink-recovery-v1\./);
  assert.equal(store.counts().agreement_receipts, 1);
  assert.equal(store.counts().accounts, 1);

  const replay = await agree(baseUrl, started.form, started.cookie);
  assert.equal(replay.status, 400);
  assert.equal(store.counts().agreement_receipts, 1);

  const already = await fetch(`${baseUrl}/onboarding`, {
    headers: auth(),
  });
  assert.equal(already.status, 200);
  assert.match(await already.text(), /同意済みです/);
});

test("CSRF, another identity, tampering, and stale terms fail closed", async (t) => {
  const wrongOriginFixture = await fixture(t);
  const wrongOrigin = await begin(wrongOriginFixture.baseUrl);
  assert.equal(
    (
      await agree(
        wrongOriginFixture.baseUrl,
        wrongOrigin.form,
        wrongOrigin.cookie,
        "user-a",
        "https://evil.example",
      )
    ).status,
    400,
  );

  const identityFixture = await fixture(t);
  const identityBound = await begin(identityFixture.baseUrl);
  assert.equal(
    (
      await agree(
        identityFixture.baseUrl,
        identityBound.form,
        identityBound.cookie,
        "user-b",
      )
    ).status,
    400,
  );

  const tamperFixture = await fixture(t);
  const tampered = await begin(tamperFixture.baseUrl);
  tampered.form.set("content_sha256", "0".repeat(64));
  assert.equal(
    (await agree(tamperFixture.baseUrl, tampered.form, tampered.cookie)).status,
    400,
  );

  const staleFixture = await fixture(t);
  const stale = await begin(staleFixture.baseUrl);
  staleFixture.store.createTermsArtifact({
    termsId: "trial-terms-ja-v2",
    kind: "trial_terms",
    version: "trial-terms-ja-v2",
    locale: "ja-JP",
    effectiveAt: "2026-09-01",
    content: "changed",
    summary: "changed",
  });
  staleFixture.store.activateTerms("trial-terms-ja-v2");
  assert.equal(
    (await agree(staleFixture.baseUrl, stale.form, stale.cookie)).status,
    409,
  );
});

test("expired short-lived nonce is rejected without provisioning", async (t) => {
  let timestamp = 1_000_000;
  const { baseUrl, store } = await fixture(t, { now: () => timestamp });
  const started = await begin(baseUrl);
  timestamp += 10 * 60 * 1000 + 1;
  assert.equal(
    (await agree(baseUrl, started.form, started.cookie)).status,
    400,
  );
  assert.equal(store.counts().accounts, 0);
});

test("materially changed terms require a fresh explicit re-consent", async (t) => {
  const { baseUrl, store } = await fixture(t);
  const initial = await begin(baseUrl);
  assert.equal(
    (await agree(baseUrl, initial.form, initial.cookie)).status,
    201,
  );

  store.createTermsArtifact({
    termsId: "trial-terms-ja-v2",
    kind: "trial_terms",
    version: "trial-terms-ja-v2",
    locale: "ja-JP",
    effectiveAt: "2026-09-01",
    content: "changed terms",
    summary: "changed summary",
  });
  store.activateTerms("trial-terms-ja-v2");

  const reconsentHandler = createLlmthinkOnboardingHandler({
    store,
    publicOrigin: ORIGIN,
    termsId: "trial-terms-ja-v2",
    privacyNoticeId: PRIVACY_ID,
    scopePolicyId: POLICY_ID,
    authenticate: async () => ({
      identity: identity("user-a"),
      requestId: "reconsent",
    }),
  });
  const reconsentServer = createServer((request, response) => {
    reconsentHandler(request, response).then((handled) => {
      if (!handled) {
        response.statusCode = 404;
        response.end();
      }
    });
  });
  await new Promise<void>((resolve) =>
    reconsentServer.listen(0, "127.0.0.1", resolve),
  );
  t.after(
    () =>
      new Promise<void>((resolve, reject) =>
        reconsentServer.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  const reconsentUrl = `http://127.0.0.1:${(reconsentServer.address() as AddressInfo).port}`;
  assert.equal(
    store.onboardingAccountState(identity("user-a")),
    "reconsent_required",
  );
  const changed = await begin(reconsentUrl);
  assert.match(changed.html, /再同意する/);
  const accepted = await agree(reconsentUrl, changed.form, changed.cookie);
  assert.equal(accepted.status, 200);
  assert.match(await accepted.text(), /再同意が完了しました/);
  assert.equal(store.onboardingAccountState(identity("user-a")), "active");
  assert.equal(store.counts().agreement_receipts, 2);
});
