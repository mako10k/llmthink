import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  draftThought,
  finalizeThought,
  loadThought,
  saveThoughtSemanticAudit,
} from "../../src/thought/store.js";

const SEMANTIC_AUDIT = {
  decisionId: "D1",
  supportId: "E1",
  verdict: "supported" as const,
  reason: "Grounded",
};

test("new thought text files use the canonical .think extension", () => {
  const baseDir = mkdtempSync(join(tmpdir(), "llmthink-store-canonical-"));
  try {
    const record = draftThought("new-thought", "new draft", baseDir);
    const finalized = finalizeThought("new-thought", "new final", baseDir);
    saveThoughtSemanticAudit("new-thought", SEMANTIC_AUDIT, baseDir);
    const thoughtDir = join(baseDir, ".llmthink", "thoughts", "new-thought");

    assert.match(record.current_draft_path ?? "", /draft\.think$/);
    assert.match(finalized.final_path ?? "", /final\.think$/);
    assert.equal(existsSync(join(thoughtDir, "draft.think")), true);
    assert.equal(existsSync(join(thoughtDir, "final.think")), true);
    assert.equal(existsSync(join(thoughtDir, "semantic-audit.think")), true);
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test("legacy .dsl thought files are read and updated in place", () => {
  const baseDir = mkdtempSync(join(tmpdir(), "llmthink-store-legacy-"));
  try {
    const thoughtDir = join(baseDir, ".llmthink", "thoughts", "legacy-thought");
    mkdirSync(join(thoughtDir, "audits"), { recursive: true });
    writeFileSync(
      join(thoughtDir, "thought.json"),
      `${JSON.stringify(
        {
          id: "legacy-thought",
          created_at: "2026-08-12T00:00:00.000Z",
          updated_at: "2026-08-12T00:00:00.000Z",
          status: "draft",
          current_draft_path: "thoughts/legacy-thought/draft.dsl",
          final_path: "thoughts/legacy-thought/final.dsl",
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    writeFileSync(join(thoughtDir, "history.json"), "[]\n", "utf8");
    writeFileSync(join(thoughtDir, "draft.dsl"), "old draft", "utf8");
    writeFileSync(join(thoughtDir, "final.dsl"), "old final", "utf8");
    writeFileSync(join(thoughtDir, "semantic-audit.dsl"), "", "utf8");

    draftThought("legacy-thought", "updated draft", baseDir);
    finalizeThought("legacy-thought", "updated final", baseDir);
    saveThoughtSemanticAudit("legacy-thought", SEMANTIC_AUDIT, baseDir);
    const snapshot = loadThought("legacy-thought", baseDir);

    assert.equal(snapshot.draftText, "updated draft");
    assert.equal(snapshot.finalText, "updated final");
    assert.match(snapshot.semanticAuditText ?? "", /verdict supported/);
    assert.equal(
      readFileSync(join(thoughtDir, "draft.dsl"), "utf8"),
      "updated draft",
    );
    assert.equal(
      readFileSync(join(thoughtDir, "final.dsl"), "utf8"),
      "updated final",
    );
    assert.equal(existsSync(join(thoughtDir, "draft.think")), false);
    assert.equal(existsSync(join(thoughtDir, "final.think")), false);
    assert.equal(existsSync(join(thoughtDir, "semantic-audit.think")), false);
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});
