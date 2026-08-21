import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { LlmthinkArchiveService } from "../../src/server/archive-service.js";
import type { ThoughtRepository } from "../../src/server/contracts.js";
import type { ArchiveLifecycleAuthority } from "../../src/server/archive-service.js";

const identity = {
  issuer: "https://cozy-bamboo-05-staging.authkit.app",
  subjectId: "workos-user-1",
  tokenScopes: ["openid"],
};

test("archive service emits canonical tenant-bounded JSON and records only metadata", async () => {
  const contexts: unknown[] = [];
  const repository = {
    async list(_query: unknown, context: unknown) {
      contexts.push(context);
      return {
        items: [{ z: 2, a: "thought", optional: undefined }],
      };
    },
  } as unknown as ThoughtRepository;
  let recorded: Record<string, unknown> | undefined;
  const lifecycle: ArchiveLifecycleAuthority = {
    archiveContext() {
      return {
        subjectId: "subj-internal",
        tenantId: "tenant-owned",
        workspaceId: "ws-owned",
        scopes: ["thought:read"],
        requestId: "archive-request-1",
      };
    },
    recordArchive(_identity, input) {
      recorded = { ...input };
      return {
        archiveReceiptId: "archive-receipt-1",
        formatVersion: "llmthink-archive-v1",
        ...input,
        createdAt: "2026-08-21T00:00:00.000Z",
      };
    },
  };

  const archive = await new LlmthinkArchiveService({
    repository,
    lifecycle,
  }).create(identity);
  const expected =
    '{"format":"llmthink-archive-v1","thoughts":[{"a":"thought","z":2}]}\n';
  assert.equal(Buffer.from(archive.bytes).toString("utf8"), expected);
  assert.deepEqual(contexts, [
    {
      subjectId: "subj-internal",
      tenantId: "tenant-owned",
      workspaceId: "ws-owned",
      scopes: ["thought:read"],
      requestId: "archive-request-1",
    },
  ]);
  assert.deepEqual(recorded, {
    contentSha256: createHash("sha256").update(expected).digest("hex"),
    byteLength: Buffer.byteLength(expected),
    itemCount: 1,
  });
  assert.equal("thoughts" in (recorded ?? {}), false);
});

test("archive service does not write a receipt after a size failure", async () => {
  const repository = {
    async list() {
      return { items: [{ text: "too large" }] };
    },
  } as unknown as ThoughtRepository;
  let writes = 0;
  const lifecycle: ArchiveLifecycleAuthority = {
    archiveContext() {
      return {
        subjectId: "subj-internal",
        tenantId: "tenant-owned",
        workspaceId: "ws-owned",
        scopes: ["thought:read"],
        requestId: "archive-request-1",
      };
    },
    recordArchive() {
      writes += 1;
      throw new Error("unexpected receipt");
    },
  };
  const service = new LlmthinkArchiveService({
    repository,
    lifecycle,
    maxBytes: 8,
  });
  await assert.rejects(service.create(identity), /configured size limit/);
  assert.equal(writes, 0);
});
