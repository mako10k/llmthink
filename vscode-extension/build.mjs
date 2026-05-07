import { build } from "esbuild";

await build({
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node20",
  external: ["vscode", "vscode-languageclient", "vscode-languageclient/node"],
  sourcemap: false,
  logLevel: "info",
});
