// R: Verify relation navigation and diagnostics through the actual LSP process.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from "vscode-languageserver/node.js";
import { parseDocument } from "@mako10k/llmthink-core";

test(
  "LSP navigates and renames support, action, detail and edge-evidence occurrences",
  { timeout: 15_000 },
  async (t) => {
    const child = spawn(process.execPath, ["dist/lsp/server.js", "--stdio"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const connection = createMessageConnection(
      new StreamMessageReader(child.stdout),
      new StreamMessageWriter(child.stdin),
    );
    t.after(() => {
      connection.dispose();
      child.kill();
    });
    connection.listen();
    await connection.sendRequest("initialize", {
      processId: process.pid,
      rootUri: null,
      capabilities: {},
    });
    await connection.sendNotification("initialized", {});
    const text = `evidence C:
  "observed"
decision M based_on C acts_on C:
  "action"
  relation based_on C:
    kind support
  relation acts_on C:
    kind intervention
    mechanism "change"
    evidence C
`;
    const uri = "file:///tmp/relation-navigation.think";
    const diagnosed = new Promise<void>((resolve) => {
      connection.onNotification(
        "textDocument/publishDiagnostics",
        (params: { uri: string }) => {
          if (params.uri === uri) resolve();
        },
      );
    });
    await connection.sendNotification("textDocument/didOpen", {
      textDocument: { uri, languageId: "llmthink", version: 1, text },
    });
    await diagnosed;
    for (const [line, expected] of [
      [5, ["support", "causal"]],
      [7, ["intervention", "mitigation", "recovery"]],
    ] as const) {
      const items = (await connection.sendRequest("textDocument/completion", {
        textDocument: { uri },
        position: { line, character: 9 },
      })) as { label: string }[];
      assert.deepEqual(
        items.map((item) => item.label),
        [...expected],
      );
    }
    const node = parseDocument(text).steps[1]!.statement;
    assert.equal(node.role, "decision");
    if (node.role !== "decision") return;
    const span = node.actsOnSpans![0]!;
    const position = { line: span.line - 1, character: span.column - 1 };
    const definition = (await connection.sendRequest(
      "textDocument/definition",
      { textDocument: { uri }, position },
    )) as { range: { start: { line: number } } };
    assert.equal(definition.range.start.line, 0);
    const edit = (await connection.sendRequest("textDocument/rename", {
      textDocument: { uri },
      position,
      newName: "Renamed",
    })) as {
      changes: Record<
        string,
        Array<{
          range: { start: { line: number; character: number } };
          newText: string;
        }>
      >;
    };
    const changes = edit.changes[uri]!;
    assert.equal(changes.length, 6);
    assert.ok(changes.every((change) => change.newText === "Renamed"));
    assert.ok(changes.some((change) => change.range.start.line === 9));
    await connection.sendRequest("shutdown");
    await connection.sendNotification("exit");
  },
);
