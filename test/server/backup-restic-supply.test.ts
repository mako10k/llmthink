import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  RESTIC_LINUX_AMD64_ASSET,
  RESTIC_LINUX_AMD64_SHA256,
  RESTIC_SIGNING_FINGERPRINT,
  verifyResticSupply,
} from "../../src/server/backup/restic-supply.js";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "llmthink-restic-supply-"));
  const paths = {
    assetPath: join(root, RESTIC_LINUX_AMD64_ASSET),
    checksumsPath: join(root, "SHA256SUMS"),
    signaturePath: join(root, "SHA256SUMS.asc"),
    keyringPath: join(root, "restic-signing.gpg"),
    outputBinaryPath: join(root, "restic-0.19.1"),
    outputReceiptPath: join(root, "receipt.json"),
  };
  writeFileSync(paths.assetPath, "fixture");
  writeFileSync(
    paths.checksumsPath,
    `${RESTIC_LINUX_AMD64_SHA256}  ${RESTIC_LINUX_AMD64_ASSET}\n`,
  );
  writeFileSync(paths.signaturePath, "signature");
  writeFileSync(paths.keyringPath, "keyring");
  return paths;
}

test("restic supply verifier emits a path-free receipt after every gate", async () => {
  const paths = fixture();
  const receipt = await verifyResticSupply({
    ...paths,
    verifier: "operator-1",
    now: () => new Date("2026-08-21T05:00:00.000Z"),
    run: async (executable) =>
      executable === "/usr/bin/gpgv"
        ? {
            exitCode: 0,
            signal: null,
            stdout: `[GNUPG:] VALIDSIG ${RESTIC_SIGNING_FINGERPRINT}\n`,
            stderr: "gpgv diagnostic is not receipt data",
          }
        : {
            exitCode: 0,
            signal: null,
            stdout: "restic 0.19.1 compiled with go1.test on linux/amd64\n",
            stderr: "",
          },
    decompress: async (_asset, output) => writeFileSync(output, "binary"),
    hashFile: async (path) => {
      if (path === paths.assetPath) return RESTIC_LINUX_AMD64_SHA256;
      return "b".repeat(64);
    },
  });
  assert.equal(receipt.binary_sha256, "b".repeat(64));
  assert.equal(receipt.signing_fingerprint, RESTIC_SIGNING_FINGERPRINT);
  const serialized = readFileSync(paths.outputReceiptPath, "utf8");
  assert.equal(serialized.includes(paths.assetPath), false);
  assert.deepEqual(JSON.parse(serialized), receipt);
});

test("restic supply verifier fails closed before decompression on bad signature", async () => {
  const paths = fixture();
  let decompressed = false;
  await assert.rejects(
    verifyResticSupply({
      ...paths,
      verifier: "operator-1",
      run: async () => ({
        exitCode: 0,
        signal: null,
        stdout: `[GNUPG:] VALIDSIG ${"0".repeat(40)}\n`,
        stderr: "",
      }),
      decompress: async () => {
        decompressed = true;
      },
      hashFile: async () => RESTIC_LINUX_AMD64_SHA256,
    }),
    { code: "signature_invalid" },
  );
  assert.equal(decompressed, false);
});
