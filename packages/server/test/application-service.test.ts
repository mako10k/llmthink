import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { auditDslText, type AuditReport } from "@llmthink/core";

import {
  LlmthinkApplicationService,
  LlmthinkServerError,
  ServerFileThoughtRepository,
  type CommandIdentity,
  type LlmthinkServerScope,
  type RequestContext,
  type ThoughtRef,
} from "../src/index.js";

const IDENTITY: CommandIdentity = {
  idempotencyKey: "create-1",
  requestDigest: `sha256:${"a".repeat(64)}`,
};

const REPORT: AuditReport = {
  engine_version: "test",
  document_id: "document-1",
  generated_at: "2026-08-19T00:00:00.000Z",
  summary: {
    fatal_count: 0,
    error_count: 0,
    warning_count: 0,
    info_count: 0,
    hint_count: 0,
  },
  results: [],
  query_results: [],
};

function context(scopes: readonly LlmthinkServerScope[]): RequestContext {
  return {
    subjectId: "user-1",
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    scopes,
    requestId: "request-1",
  };
}

const REF: ThoughtRef = {
  tenantId: "tenant-1",
  workspaceId: "workspace-1",
  thoughtId: "thought-1",
};

async function fixture(t: test.TestContext): Promise<{
  service: LlmthinkApplicationService;
  repository: ServerFileThoughtRepository;
}> {
  const root = await mkdtemp(join(tmpdir(), "llmthink-application-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repository = new ServerFileThoughtRepository({ dataRoot: root });
  return {
    repository,
    service: new LlmthinkApplicationService({
      repository,
      auditRunner: async () => REPORT,
    }),
  };
}

function expectCode(
  code: LlmthinkServerError["code"],
): (error: unknown) => boolean {
  return (error) => error instanceof LlmthinkServerError && error.code === code;
}

test("pure audit preserves the core report and never persists", async (t) => {
  const { service, repository } = await fixture(t);
  const result = await service.audit(
    { text: "problem P1:\n  “question”", documentId: "document-1" },
    context(["audit:run"]),
  );

  assert.equal(result.persisted, false);
  assert.equal(result.report, REPORT);
  assert.deepEqual(
    (await repository.list({ limit: 10 }, context(["thought:read"]))).items,
    [],
  );
});

test("default pure audit preserves core audit meaning", async (t) => {
  const { repository } = await fixture(t);
  const service = new LlmthinkApplicationService({ repository });
  const command = {
    text: 'problem P1:\n  "question"',
    documentId: "document-1",
  };
  const [direct, throughService] = await Promise.all([
    auditDslText(command.text, command.documentId),
    service.audit(command, context(["audit:run"])),
  ]);
  assert.deepEqual(
    { ...throughService.report, generated_at: "normalized" },
    { ...direct, generated_at: "normalized" },
  );
});

test("commands and queries require their explicit scopes", async (t) => {
  const { service } = await fixture(t);
  await assert.rejects(
    service.createThought(
      { thoughtId: "thought-1", draftText: "draft", identity: IDENTITY },
      context(["thought:read"]),
    ),
    expectCode("forbidden"),
  );
  await assert.rejects(
    service.audit({ text: 'problem P1:\n  "question"' }, context([])),
    expectCode("forbidden"),
  );
  await assert.rejects(
    service.listThoughts({ limit: 10 }, context(["thought:write"])),
    expectCode("forbidden"),
  );
});

test("missing verified identity is unauthenticated before repository access", async (t) => {
  const { service } = await fixture(t);
  const invalid = {
    ...context(["thought:read"]),
    subjectId: "",
  };
  await assert.rejects(
    service.getThought(REF, invalid),
    expectCode("unauthenticated"),
  );
});

test("missing thoughts use the stable not_found domain error", async (t) => {
  const { service } = await fixture(t);
  await assert.rejects(
    service.getThought(REF, context(["thought:read"])),
    expectCode("not_found"),
  );
});

test("delete is revision-bound, tenant-bound, physical, and idempotent", async (t) => {
  const { service } = await fixture(t);
  const write = context(["thought:write", "thought:read"]);
  await service.createThought(
    { thoughtId: "delete-me", draftText: "synthetic", identity: IDENTITY },
    write,
  );
  const command = {
    ref: { ...REF, thoughtId: "delete-me" },
    expectedRevision: 1,
    identity: {
      idempotencyKey: "delete-1",
      requestDigest: `sha256:${"d".repeat(64)}` as const,
    },
  };
  await assert.rejects(
    service.deleteThought(command, { ...write, tenantId: "tenant-2" }),
    expectCode("forbidden"),
  );
  const deleted = await service.deleteThought(command, write);
  assert.deepEqual(deleted, {
    thoughtId: "delete-me",
    deleted: true,
    deletedRevision: 1,
  });
  await assert.rejects(
    service.getThought(command.ref, write),
    expectCode("not_found"),
  );
  assert.deepEqual(await service.deleteThought(command, write), deleted);
});

test("allowed commands retain repository revision and idempotency semantics", async (t) => {
  const { service } = await fixture(t);
  const writeContext = context(["thought:write"]);
  const command = {
    thoughtId: "thought-1",
    draftText: "draft",
    identity: IDENTITY,
  };
  const created = await service.createThought(command, writeContext);
  const replay = await service.createThought(command, writeContext);
  assert.equal(created.revision, 1);
  assert.equal(replay.revision, 1);

  await service.saveDraft(
    {
      ref: REF,
      expectedRevision: 1,
      draftText: "updated",
      identity: {
        idempotencyKey: "save-1",
        requestDigest: `sha256:${"b".repeat(64)}`,
      },
    },
    writeContext,
  );
  await assert.rejects(
    service.saveDraft(
      {
        ref: REF,
        expectedRevision: 1,
        draftText: "stale",
        identity: {
          idempotencyKey: "save-2",
          requestDigest: `sha256:${"c".repeat(64)}`,
        },
      },
      writeContext,
    ),
    expectCode("revision_conflict"),
  );
});

test("persisted audit and finalization keep compound authorization boundaries", async (t) => {
  const { service } = await fixture(t);
  await service.createThought(
    { thoughtId: "thought-1", draftText: "draft", identity: IDENTITY },
    context(["thought:write"]),
  );
  const auditCommand = {
    ref: REF,
    expectedRevision: 1,
    report: REPORT,
    identity: {
      idempotencyKey: "audit-1",
      requestDigest: `sha256:${"d".repeat(64)}` as const,
    },
  };
  await assert.rejects(
    service.recordAudit(auditCommand, context(["thought:write"])),
    expectCode("forbidden"),
  );
  const audited = await service.recordAudit(
    auditCommand,
    context(["thought:write", "audit:run"]),
  );
  assert.equal(audited.revision, 2);

  await assert.rejects(
    service.finalizeThought(
      {
        ref: REF,
        expectedRevision: 2,
        finalText: "final",
        confirmationToken: "",
        identity: {
          idempotencyKey: "finalize-1",
          requestDigest: `sha256:${"e".repeat(64)}`,
        },
      },
      context(["thought:finalize"]),
    ),
    expectCode("confirmation_required"),
  );
});
