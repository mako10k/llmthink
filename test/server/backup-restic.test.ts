import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  backupGenerationWithRestic,
  ResticAdapterError,
  type ResticProcessRequest,
  type ResticProcessResult,
} from "../../src/server/backup/restic.js";

const SNAPSHOT = "c".repeat(64);
const PASSWORD = randomBytes(32).toString("hex");
const SECRET = randomBytes(32).toString("hex");
const CREDENTIAL_FILE = [
  "",
  "run",
  "credentials",
  "backup",
  "repository-key",
].join("/");

function result(
  stdout: string,
  overrides: Partial<ResticProcessResult> = {},
): ResticProcessResult {
  return { exitCode: 0, signal: null, stdout, stderr: "", ...overrides };
}

function options(
  runner: (request: ResticProcessRequest) => Promise<ResticProcessResult>,
) {
  return {
    executable: "/opt/llmthink/bin/restic",
    expectedVersion: "0.19.1",
    repository: "s3:https://example.invalid/test-prefix",
    passwordFile: CREDENTIAL_FILE,
    cacheDirectory: "/var/cache/llmthink-backup",
    generationPath:
      "/var/lib/llmthink-backup/generations/generation_0123456789abcdef",
    generationId: "generation_0123456789abcdef",
    manifestSha256: `sha256:${"a".repeat(64)}` as const,
    profileId: "llmthink-trial-v1",
    accessKeyId: "test-key-id",
    secretAccessKey: SECRET,
    now: () => new Date("2026-08-21T04:00:00.000Z"),
    runner,
  };
}

test("restic adapter uses exact argv, keeps secrets out of argv, and rereads the snapshot", async () => {
  const requests: ResticProcessRequest[] = [];
  const runner = async (
    request: ResticProcessRequest,
  ): Promise<ResticProcessResult> => {
    requests.push(request);
    if (request.args[0] === "version")
      return result("restic 0.19.1 compiled with go1.test\n");
    if (request.args[0] === "backup")
      return result(
        `${JSON.stringify({ message_type: "status", percent_done: 1 })}\n${JSON.stringify({ message_type: "summary", dry_run: false, files_new: 3, data_added: 101, snapshot_id: SNAPSHOT })}\n`,
      );
    return result(
      JSON.stringify([
        {
          id: SNAPSHOT,
          hostname: "llmthink-trial-v1",
          tags: [
            "llmthink-backup-v1",
            "generation:generation_0123456789abcdef",
          ],
          paths: [
            "/var/lib/llmthink-backup/generations/generation_0123456789abcdef",
          ],
          program_version: "restic 0.19.1",
        },
      ]),
    );
  };
  const receipt = await backupGenerationWithRestic(options(runner));
  assert.equal(receipt.snapshot_id, SNAPSHOT);
  assert.equal(receipt.bytes_added, 101);
  assert.deepEqual(
    requests.map(({ args }) => args[0]),
    ["version", "backup", "snapshots"],
  );
  for (const request of requests) {
    assert.equal(request.executable, "/opt/llmthink/bin/restic");
    assert.equal(request.args.includes(PASSWORD), false);
    assert.equal(request.args.includes(SECRET), false);
    assert.equal(request.env.RESTIC_PASSWORD, undefined);
    assert.equal(request.env.AWS_SECRET_ACCESS_KEY, SECRET);
  }
});

test("restic adapter fails closed on version, process, stderr, and unknown JSON", async () => {
  const cases: Array<{
    output: ResticProcessResult;
    code: ResticAdapterError["code"];
  }> = [
    { output: result("restic 0.18.0 compiled\n"), code: "version_mismatch" },
    { output: result("", { exitCode: 3 }), code: "process_failed" },
    {
      output: result("restic 0.19.1\n", {
        stderr: "warning containing a path",
      }),
      code: "process_failed",
    },
  ];
  for (const item of cases) {
    await assert.rejects(
      backupGenerationWithRestic(options(async () => item.output)),
      { code: item.code },
    );
  }
  let call = 0;
  await assert.rejects(
    backupGenerationWithRestic(
      options(async () => {
        call += 1;
        return call === 1
          ? result("restic 0.19.1\n")
          : result('{"message_type":"future_message"}\n');
      }),
    ),
    { code: "ambiguous_output" },
  );
});

test("restic adapter rejects a mismatched exact snapshot reread", async () => {
  let call = 0;
  await assert.rejects(
    backupGenerationWithRestic(
      options(async () => {
        call += 1;
        if (call === 1) return result("restic 0.19.1\n");
        if (call === 2)
          return result(
            `${JSON.stringify({ message_type: "summary", dry_run: false, files_new: 1, data_added: 1, snapshot_id: SNAPSHOT })}\n`,
          );
        return result(
          JSON.stringify([
            {
              id: SNAPSHOT,
              hostname: "wrong-host",
              tags: [],
              paths: [],
              program_version: "restic 0.19.1",
            },
          ]),
        );
      }),
    ),
    { code: "snapshot_mismatch" },
  );
});
