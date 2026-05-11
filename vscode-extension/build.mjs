import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const bundledLspOutfile = "dist/llmthink-lsp.js";

function validateBundledNodeEntrypoint(outfile) {
  const resolvedOutfile = fileURLToPath(new URL(`./${outfile}`, import.meta.url));
  const bundleText = readFileSync(resolvedOutfile, "utf8");
  const shebangLines = bundleText.match(/^#!.*$/gm) ?? [];

  if (shebangLines.length > 1) {
    throw new Error(
      `Expected at most one shebang in ${outfile}, found ${shebangLines.length}.`,
    );
  }

  const syntaxCheck = spawnSync(process.execPath, ["--check", resolvedOutfile], {
    encoding: "utf8",
  });

  if (syntaxCheck.status !== 0) {
    const detail = (syntaxCheck.stderr || syntaxCheck.stdout || "").trim();
    throw new Error(
      `Bundled Node entrypoint failed syntax check: ${outfile}${detail ? `\n${detail}` : ""}`,
    );
  }
}

await build({
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node20",
  external: ["vscode"],
  minify: true,
  legalComments: "none",
  sourcemap: false,
  logLevel: "info",
});

await build({
  entryPoints: ["../src/lsp/server.ts"],
  outfile: bundledLspOutfile,
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node20",
  minify: true,
  legalComments: "none",
  sourcemap: false,
  logLevel: "info",
});

validateBundledNodeEntrypoint(bundledLspOutfile);
