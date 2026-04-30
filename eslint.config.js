import js from "@eslint/js";
import globals from "globals";
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "vscode-extension/dist/**",
      "node_modules/**",
      ".llmthink/**",
      ".tmp/**",
      "**/*.d.ts",
      "llmthink.vsix",
      "vscode-extension/llmthink.vsix",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  sonarjs.configs.recommended,
  {
    files: [
      "src/**/*.ts",
      "vscode-extension/src/**/*.ts",
      "*.js",
      "vscode-extension/*.mjs",
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      complexity: ["error", 12],
      "sonarjs/cognitive-complexity": ["error", 20],
      "no-console": "off",
    },
  },
);
