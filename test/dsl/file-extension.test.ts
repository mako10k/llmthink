import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { auditDslFile } from "../../src/analyzer/audit.js";
import {
  alternateLlmthinkFilePath,
  isLlmthinkFilePath,
  llmthinkFileExtension,
  stripLlmthinkFileExtension,
} from "../../src/dsl/file-extension.js";
import {
  deriveThoughtIdFromFilePath,
  normalizeThoughtId,
} from "../../src/thought/workflow.js";

const VALID_DOCUMENT = ["problem P1:", '  "Example"', ""].join("\n");

test(".think is canonical while .dsl remains a compatible alias", () => {
  assert.equal(llmthinkFileExtension("sample.think"), ".think");
  assert.equal(llmthinkFileExtension("sample.DSL"), ".dsl");
  assert.equal(stripLlmthinkFileExtension("sample.think"), "sample");
  assert.equal(stripLlmthinkFileExtension("sample.dsl"), "sample");
  assert.equal(isLlmthinkFilePath("sample.txt"), false);
  assert.equal(alternateLlmthinkFilePath("sample.think"), "sample.dsl");
  assert.equal(alternateLlmthinkFilePath("sample.dsl"), "sample.think");
});

test(".think and .dsl produce the same document and thought identities", async () => {
  const baseDir = mkdtempSync(join(tmpdir(), "llmthink-file-extension-"));
  try {
    const thinkDir = join(baseDir, "think");
    const dslDir = join(baseDir, "dsl");
    mkdirSync(thinkDir);
    mkdirSync(dslDir);
    const thinkPath = join(thinkDir, "sample.think");
    const dslPath = join(dslDir, "sample.dsl");
    writeFileSync(thinkPath, VALID_DOCUMENT, { encoding: "utf8", flag: "wx" });
    writeFileSync(dslPath, VALID_DOCUMENT, { encoding: "utf8", flag: "wx" });

    const thinkReport = await auditDslFile(thinkPath);
    const dslReport = await auditDslFile(dslPath);
    assert.equal(thinkReport.document_id, "sample");
    assert.equal(dslReport.document_id, "sample");
    assert.equal(normalizeThoughtId("path/sample.think"), "path-sample");
    assert.equal(normalizeThoughtId("path/sample.dsl"), "path-sample");
    assert.equal(
      deriveThoughtIdFromFilePath(thinkPath, thinkDir),
      deriveThoughtIdFromFilePath(dslPath, dslDir),
    );
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test("implicit thought identity fails closed when both extensions coexist", () => {
  const baseDir = mkdtempSync(join(tmpdir(), "llmthink-file-collision-"));
  try {
    const thinkPath = join(baseDir, "sample.think");
    const dslPath = join(baseDir, "sample.dsl");
    writeFileSync(thinkPath, VALID_DOCUMENT, "utf8");
    writeFileSync(dslPath, VALID_DOCUMENT, "utf8");

    assert.throws(
      () => deriveThoughtIdFromFilePath(thinkPath, baseDir),
      /Both .*sample\.think and .*sample\.dsl exist; pass --id/,
    );
    assert.throws(
      () => deriveThoughtIdFromFilePath(dslPath, baseDir),
      /Both .*sample\.dsl and .*sample\.think exist; pass --id/,
    );
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});
