import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  LlmthinkServerError,
  ServerFileThoughtRepository,
  type CommandIdentity,
  type RequestContext,
  type ThoughtRef,
} from "../src/index.js";

const IDENTITY_A: CommandIdentity = {
  idempotencyKey: "request-a",
  requestDigest: `sha256:${"a".repeat(64)}`,
};
const IDENTITY_B: CommandIdentity = {
  idempotencyKey: "request-b",
  requestDigest: `sha256:${"b".repeat(64)}`,
};

function context(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    subjectId: "user-1",
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    scopes: ["thought:read", "thought:write"],
    requestId: "request-1",
    ...overrides,
  };
}

function ref(overrides: Partial<ThoughtRef> = {}): ThoughtRef {
  return {
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    thoughtId: "thought-1",
    ...overrides,
  };
}

async function fixture(): Promise<{
  root: string;
  repository: ServerFileThoughtRepository;
}> {
  const root = await mkdtemp(join(tmpdir(), "llmthink-server-store-"));
  return {
    root,
    repository: new ServerFileThoughtRepository({ dataRoot: root }),
  };
}

function expectCode(
  code: LlmthinkServerError["code"],
): (error: unknown) => boolean {
  return (error) => error instanceof LlmthinkServerError && error.code === code;
}

test("server repository requires an explicit absolute data root", () => {
  assert.throws(
    () => new ServerFileThoughtRepository({ dataRoot: ".llmthink" }),
    expectCode("invalid_argument"),
  );
});

test("commits immutable revisions and an atomic CURRENT pointer", async (t) => {
  const { root, repository } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  const created = await repository.create(
    { thoughtId: "thought-1", draftText: "first draft", identity: IDENTITY_A },
    context(),
  );
  const saved = await repository.saveDraft(
    {
      ref: ref(),
      expectedRevision: 1,
      draftText: "second draft",
      identity: IDENTITY_B,
    },
    context(),
  );

  assert.equal(created.revision, 1);
  assert.equal(saved.revision, 2);
  assert.equal(saved.draftText, "second draft");
  const thought = join(
    root,
    "tenants",
    "tenant-1",
    "workspaces",
    "workspace-1",
    "thoughts",
    "thought-1",
  );
  assert.deepEqual((await readdir(join(thought, "revisions"))).sort(), [
    "0000000000000001",
    "0000000000000002",
  ]);
  assert.equal(
    JSON.parse(await readFile(join(thought, "CURRENT"), "utf8")).revision,
    2,
  );
  assert.equal(
    await readFile(
      join(thought, "revisions", "0000000000000001", "draft.think"),
      "utf8",
    ),
    "first draft",
  );
});

test("rejects traversal and cross-tenant references without touching another tenant", async (t) => {
  const { root, repository } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  await assert.rejects(
    repository.create(
      { thoughtId: "../escape", draftText: "x", identity: IDENTITY_A },
      context(),
    ),
    expectCode("invalid_argument"),
  );
  await repository.create(
    { thoughtId: "thought-1", draftText: "private", identity: IDENTITY_A },
    context(),
  );
  await assert.rejects(
    repository.get(ref({ tenantId: "tenant-2" }), context()),
    expectCode("forbidden"),
  );
  assert.equal(
    await repository.get(
      ref({ tenantId: "tenant-2" }),
      context({ tenantId: "tenant-2" }),
    ),
    null,
  );
});

test("serializes concurrent writes and rejects the stale revision", async (t) => {
  const { root, repository } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await repository.create(
    { thoughtId: "thought-1", draftText: "base", identity: IDENTITY_A },
    context(),
  );

  const outcomes = await Promise.allSettled([
    repository.saveDraft(
      {
        ref: ref(),
        expectedRevision: 1,
        draftText: "one",
        identity: IDENTITY_B,
      },
      context(),
    ),
    repository.saveDraft(
      {
        ref: ref(),
        expectedRevision: 1,
        draftText: "two",
        identity: {
          idempotencyKey: "request-c",
          requestDigest: `sha256:${"c".repeat(64)}`,
        },
      },
      context(),
    ),
  ]);
  assert.equal(
    outcomes.filter((item) => item.status === "fulfilled").length,
    1,
  );
  const rejected = outcomes.find(
    (item): item is PromiseRejectedResult => item.status === "rejected",
  );
  assert.ok(rejected);
  assert.equal(rejected.reason.code, "revision_conflict");
  assert.equal((await repository.get(ref(), context()))?.revision, 2);
});

test("replays identical idempotent commands and conflicts on a changed digest", async (t) => {
  const { root, repository } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const command = {
    thoughtId: "thought-1",
    draftText: "draft",
    identity: IDENTITY_A,
  };
  const first = await repository.create(command, context());
  const thought = join(
    root,
    "tenants",
    "tenant-1",
    "workspaces",
    "workspace-1",
    "thoughts",
    "thought-1",
  );
  await rm(join(thought, "idempotency"), { recursive: true });
  const replay = await repository.create(command, context());
  assert.equal(replay.revision, first.revision);
  await assert.rejects(
    repository.create(
      {
        ...command,
        identity: { ...IDENTITY_A, requestDigest: `sha256:${"d".repeat(64)}` },
      },
      context(),
    ),
    expectCode("idempotency_conflict"),
  );
});

test("persists audit, finalization, reflections, and their append-only events", async (t) => {
  const { root, repository } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await repository.create(
    { thoughtId: "thought-1", draftText: "draft", identity: IDENTITY_A },
    context(),
  );
  const audited = await repository.recordAudit(
    {
      ref: ref(),
      expectedRevision: 1,
      identity: IDENTITY_B,
      report: {
        engine_version: "test",
        document_id: "thought-1",
        generated_at: "2026-08-18T00:00:00.000Z",
        summary: {
          fatal_count: 0,
          error_count: 0,
          warning_count: 0,
          info_count: 0,
          hint_count: 0,
        },
        results: [],
        query_results: [],
      },
    },
    context(),
  );
  const reflected = await repository.addReflection(
    {
      ref: ref(),
      expectedRevision: 2,
      identity: {
        idempotencyKey: "request-c",
        requestDigest: `sha256:${"c".repeat(64)}`,
      },
      kind: "decision",
      text: "keep the boundary",
    },
    context(),
  );
  const finalized = await repository.finalize(
    {
      ref: ref(),
      expectedRevision: 3,
      identity: {
        idempotencyKey: "request-d",
        requestDigest: `sha256:${"d".repeat(64)}`,
      },
      finalText: "final",
      confirmationToken: "confirmed",
    },
    context(),
  );

  assert.equal(audited.latestAudit?.document_id, "thought-1");
  assert.equal(reflected.reflections[0]?.text, "keep the boundary");
  assert.equal(finalized.record.status, "finalized");
  assert.deepEqual(
    (await repository.events(ref(), context())).map((event) => event.kind),
    ["draft_saved", "audit_recorded", "reflect_recorded", "finalized"],
  );
});

test("ignores orphan revisions but fails closed for incomplete CURRENT and unsupported schema", async (t) => {
  const { root, repository } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await repository.create(
    { thoughtId: "thought-1", draftText: "draft", identity: IDENTITY_A },
    context(),
  );
  const thought = join(
    root,
    "tenants",
    "tenant-1",
    "workspaces",
    "workspace-1",
    "thoughts",
    "thought-1",
  );
  await mkdir(join(thought, "revisions", "0000000000000002"));
  assert.equal((await repository.get(ref(), context()))?.revision, 1);

  await assert.rejects(
    repository.saveDraft(
      {
        ref: ref(),
        expectedRevision: 1,
        draftText: "unsafe recovery",
        identity: IDENTITY_B,
      },
      context(),
    ),
    expectCode("storage_corrupt"),
  );
  await rm(join(thought, "revisions", "0000000000000002"), {
    recursive: true,
  });
  const recovered = await repository.saveDraft(
    {
      ref: ref(),
      expectedRevision: 1,
      draftText: "recovered",
      identity: IDENTITY_B,
    },
    context(),
  );
  assert.equal(recovered.revision, 2);

  await writeFile(
    join(thought, "CURRENT"),
    '{"schema_version":1,"revision":3}\n',
  );
  await assert.rejects(
    repository.get(ref(), context()),
    expectCode("storage_corrupt"),
  );

  await writeFile(
    join(thought, "CURRENT"),
    '{"schema_version":99,"revision":1}\n',
  );
  await assert.rejects(
    repository.get(ref(), context()),
    expectCode("unsupported_schema_version"),
  );
});

test("list and search stay within the authenticated workspace", async (t) => {
  const { root, repository } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await repository.create(
    { thoughtId: "alpha", draftText: "needle here", identity: IDENTITY_A },
    context(),
  );
  await repository.create(
    { thoughtId: "beta", draftText: "other", identity: IDENTITY_B },
    context(),
  );
  await repository.create(
    { thoughtId: "hidden", draftText: "needle secret", identity: IDENTITY_A },
    context({ tenantId: "tenant-2" }),
  );

  assert.deepEqual(
    (await repository.list({ limit: 10 }, context())).items.map(
      (item) => item.record.id,
    ),
    ["alpha", "beta"],
  );
  assert.deepEqual(
    (
      await repository.search(
        { query: "needle", limit: 10, includeReflections: false },
        context(),
      )
    ).items.map((item) => item.record.id),
    ["alpha"],
  );
});
