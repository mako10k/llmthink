import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  LlmthinkApplicationService,
  LlmthinkServerError,
  ServerFileThoughtRepository,
  type LlmthinkServerScope,
  type RequestContext,
} from "../../src/index.js";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const pluginRoot = join(repoRoot, "plugins", "llmthink");
const HOSTED_TOOLS = new Set([
  "audit_thought",
  "create_thought_draft",
  "get_thought",
  "list_thoughts",
  "search_thoughts",
  "finalize_thought",
  "add_thought_reflection",
  "get_thought_history",
]);
const WRITE_TOOLS = new Set([
  "create_thought_draft",
  "finalize_thought",
  "add_thought_reflection",
]);

interface SelectionCase {
  readonly id: string;
  readonly kind: string;
  readonly expected_tools: readonly string[];
  readonly forbidden_tools: readonly string[];
  readonly requires: readonly string[];
}

test("plugin manifest exposes local skills and authenticated hosted MCP", async () => {
  const manifest = JSON.parse(
    await readFile(join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"),
  ) as Record<string, unknown>;
  const mcp = JSON.parse(
    await readFile(join(pluginRoot, ".mcp.json"), "utf8"),
  ) as {
    mcpServers: {
      llmthink: {
        type: string;
        url: string;
        bearer_token_env_var: string;
      };
    };
  };
  assert.equal(manifest.name, "llmthink");
  assert.equal(manifest.version, "1.2.0+codex.20260819081527");
  assert.equal(manifest.skills, "./skills/");
  assert.equal(manifest.mcpServers, "./.mcp.json");
  assert.equal("apps" in manifest, false);
  assert.equal("hooks" in manifest, false);
  assert.deepEqual(mcp.mcpServers.llmthink, {
    type: "http",
    url: "https://llmthink.mk10.org/mcp",
    bearer_token_env_var: "LLMTHINK_MCP_TOKEN",
  });
});

test("tool-selection evaluations stay inside the accepted MCP surface", async () => {
  const fixture = JSON.parse(
    await readFile(join(pluginRoot, "evals", "tool-selection.json"), "utf8"),
  ) as { schema_version: number; cases: SelectionCase[] };
  assert.equal(fixture.schema_version, 1);
  assert.deepEqual(
    new Set(fixture.cases.map((entry) => entry.kind)),
    new Set([
      "direct",
      "indirect",
      "follow_up",
      "direct_finalize",
      "unknown",
      "out_of_scope",
    ]),
  );
  for (const entry of fixture.cases) {
    for (const tool of [...entry.expected_tools, ...entry.forbidden_tools]) {
      assert.equal(HOSTED_TOOLS.has(tool), true, `${entry.id}: ${tool}`);
    }
    assert.equal(
      entry.expected_tools.some((tool) => entry.forbidden_tools.includes(tool)),
      false,
      entry.id,
    );
    if (entry.expected_tools.some((tool) => WRITE_TOOLS.has(tool))) {
      assert.equal(entry.requires.includes("idempotency_key"), true, entry.id);
      assert.equal(entry.requires.includes("request_digest"), true, entry.id);
    }
    if (entry.expected_tools.includes("finalize_thought")) {
      assert.equal(entry.requires.includes("expected_revision"), true);
      assert.equal(entry.requires.includes("confirmation_token"), false);
    }
  }
});

function context(scopes: readonly LlmthinkServerScope[]): RequestContext {
  return {
    subjectId: "user-1",
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    scopes,
    requestId: "plugin-eval-1",
  };
}

async function expectCode(
  action: () => Promise<unknown>,
  code: LlmthinkServerError["code"],
): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof LlmthinkServerError);
    assert.equal(error.code, code);
    return true;
  });
}

test("Skills cannot alter server authorization revision or confirmation outcomes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "llmthink-plugin-policy-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const service = new LlmthinkApplicationService({
    repository: new ServerFileThoughtRepository({ dataRoot: root }),
  });
  const created = await service.createThought(
    {
      thoughtId: "thought-1",
      draftText: "draft",
      identity: {
        idempotencyKey: "create-1",
        requestDigest: `sha256:${"a".repeat(64)}`,
      },
    },
    context(["thought:write"]),
  );

  await expectCode(
    () => service.audit({ text: "problem P1:\n  question" }, context([])),
    "forbidden",
  );
  await expectCode(
    () =>
      service.addReflection(
        {
          ref: {
            tenantId: "another-tenant",
            workspaceId: "workspace-1",
            thoughtId: "thought-1",
          },
          expectedRevision: created.revision,
          kind: "concern",
          text: "concern",
          identity: {
            idempotencyKey: "reflect-1",
            requestDigest: `sha256:${"b".repeat(64)}`,
          },
        },
        context(["thought:write"]),
      ),
    "forbidden",
  );
  await expectCode(
    () =>
      service.finalizeThought(
        {
          ref: {
            tenantId: "tenant-1",
            workspaceId: "workspace-1",
            thoughtId: "thought-1",
          },
          expectedRevision: created.revision,
          finalText: "final",
          confirmationToken: "",
          identity: {
            idempotencyKey: "final-1",
            requestDigest: `sha256:${"c".repeat(64)}`,
          },
        },
        context(["thought:finalize"]),
      ),
    "confirmation_required",
  );
});

test("skill packages contain no embedded credentials or external authority config", async () => {
  for (const name of [
    "llmthink-author",
    "llmthink-auditor",
    "llmthink-reflector",
  ]) {
    const text = await readFile(
      join(pluginRoot, "skills", name, "SKILL.md"),
      "utf8",
    );
    assert.equal(/Authorization:\s*Bearer/i.test(text), false, name);
    assert.equal(/api[_-]?key\s*[:=]/i.test(text), false, name);
    assert.equal(/https?:\/\/(?!127\.0\.0\.1)/i.test(text), false, name);
  }
});
