import { build } from "esbuild";

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
  outfile: "dist/llmthink-lsp.js",
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node20",
  minify: true,
  legalComments: "none",
  sourcemap: false,
  logLevel: "info",
});
