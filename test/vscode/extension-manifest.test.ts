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
    configuration: {
      properties: Record<
        string,
        {
          type: string;
          enum?: string[];
          default: unknown;
          scope?: string;
          items?: { enum?: string[] };
          properties?: Record<string, { enum?: string[] }>;
          additionalProperties?: boolean;
        }
      >;
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

test("diagnostic settings preserve defaults and constrain hint overrides", () => {
  const properties = manifest.contributes.configuration.properties;
  assert.deepEqual(properties["llmthink.diagnostics.minimumSeverity"], {
    type: "string",
    enum: ["fatal", "error", "warning", "info", "hint"],
    default: "hint",
    scope: "resource",
    markdownDescription:
      "Problems に表示する最低監査 severity。既定の `hint` は全診断を表示します。",
  });

  const suppression = properties["llmthink.diagnostics.suppressedCategories"];
  assert.deepEqual(suppression?.default, []);
  assert.deepEqual(suppression?.items?.enum, [
    "contradiction",
    "contradiction_candidate",
    "contract_violation",
    "mece_assessment",
    "semantic_hint",
  ]);

  const overrides =
    properties["llmthink.diagnostics.categorySeverityOverrides"];
  assert.deepEqual(overrides?.default, {});
  assert.equal(overrides?.additionalProperties, false);
  assert.deepEqual(Object.keys(overrides?.properties ?? {}).sort(), [
    "contradiction_candidate",
    "semantic_hint",
  ]);
  for (const setting of Object.values(overrides?.properties ?? {})) {
    assert.deepEqual(setting.enum, ["error", "warning", "info", "hint", "off"]);
  }
});
