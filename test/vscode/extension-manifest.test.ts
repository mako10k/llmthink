import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

interface ExtensionManifest {
  contributes: {
    languages: Array<{ id: string; extensions: string[] }>;
    customEditors: Array<{
      viewType: string;
      selector: Array<{ filenamePattern: string }>;
    }>;
    menus: {
      "explorer/context": Array<{ command: string; when: string }>;
    };
  };
}

const manifest = JSON.parse(
  readFileSync(
    new URL("../../vscode-extension/package.json", import.meta.url),
    "utf8",
  ),
) as ExtensionManifest;

test("VS Code registers .think first and keeps .dsl on language llmthink", () => {
  const language = manifest.contributes.languages.find(
    (candidate) => candidate.id === "llmthink",
  );
  assert.deepEqual(language?.extensions, [".think", ".dsl"]);
});

test("preview custom editor and explorer commands accept both extensions", () => {
  const preview = manifest.contributes.customEditors.find(
    (candidate) => candidate.viewType === "llmthink.preview",
  );
  assert.deepEqual(preview?.selector, [
    { filenamePattern: "*.think" },
    { filenamePattern: "*.dsl" },
  ]);

  const explorerCommands = manifest.contributes.menus["explorer/context"];
  assert.ok(explorerCommands.length > 0);
  for (const command of explorerCommands) {
    assert.equal(
      command.when,
      "resourceExtname == .think || resourceExtname == .dsl",
    );
  }
});
