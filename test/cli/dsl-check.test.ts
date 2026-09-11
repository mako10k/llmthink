import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const VALID_DOCUMENT = [
  "problem P1:",
  '  "Choose an implementation"',
  "decision D1 based_on P1:",
  '  "Use the verified implementation"',
  "",
].join("\n");
const INVALID_DOCUMENT = ["decision D1:", '  "Missing basis"', ""].join("\n");

interface CheckOutput {
  persisted: boolean;
  fail_on: string;
  failed: boolean;
  source_count: number;
  unique_content_count: number;
  documents: Array<{
    source_sha256: string;
    sources: string[];
    report: { source_sha256?: string };
  }>;
}

function runCheck(args: string[], input?: string) {
  return spawnSync(
    process.execPath,
    ["--import", "tsx", "src/cli.ts", "dsl", "check", ...args],
    { cwd: repoRoot, encoding: "utf8", input },
  );
}

test("dsl check is non-persistent, deduplicates content, and fails at the configured severity", () => {
  const root = mkdtempSync(join(tmpdir(), "llmthink-check-"));
  try {
    const documents = join(root, "documents");
    const storage = join(root, "unused-storage");
    mkdirSync(join(documents, "nested"), { recursive: true });
    mkdirSync(join(documents, "node_modules", "dependency"), {
      recursive: true,
    });
    mkdirSync(join(documents, ".git"), { recursive: true });
    writeFileSync(join(documents, "a.think"), VALID_DOCUMENT, "utf8");
    writeFileSync(
      join(documents, "nested", "copy.dsl"),
      VALID_DOCUMENT,
      "utf8",
    );
    writeFileSync(join(documents, "invalid.think"), INVALID_DOCUMENT, "utf8");
    writeFileSync(join(documents, "ignored.txt"), INVALID_DOCUMENT, "utf8");
    writeFileSync(
      join(documents, "node_modules", "dependency", "ignored.think"),
      INVALID_DOCUMENT,
      "utf8",
    );
    writeFileSync(
      join(documents, ".git", "ignored.dsl"),
      INVALID_DOCUMENT,
      "utf8",
    );

    const result = runCheck([
      documents,
      "--storage-path",
      storage,
      "--fail-on",
      "error",
    ]);
    assert.equal(result.status, 1, result.stderr);
    const output = JSON.parse(result.stdout) as CheckOutput;
    assert.equal(output.persisted, false);
    assert.equal(output.fail_on, "error");
    assert.equal(output.failed, true);
    assert.equal(output.source_count, 3);
    assert.equal(output.unique_content_count, 2);
    assert.equal(existsSync(storage), false);

    const duplicate = output.documents.find(
      (document) => document.sources.length === 2,
    );
    assert.ok(duplicate);
    assert.match(duplicate.source_sha256, /^sha256:[a-f0-9]{64}$/);
    assert.equal(duplicate.report.source_sha256, duplicate.source_sha256);

    const fatalOnly = runCheck([documents, "--fail-on", "fatal"]);
    assert.equal(fatalOnly.status, 0, fatalOnly.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dsl check accepts stdin without creating a thought", () => {
  const result = runCheck(["-", "--id", "stdin-review"], VALID_DOCUMENT);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout) as CheckOutput;
  assert.equal(output.source_count, 1);
  assert.deepEqual(output.documents[0]?.sources, ["stdin"]);
  assert.equal(
    output.documents[0]?.report.source_sha256,
    output.documents[0]?.source_sha256,
  );
});
