#!/usr/bin/env node
// R: Preserve the root Hosted command entrypoint.

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  loadHostedMcpRuntimeConfig,
  startHostedMcpServer,
} from "@mako10k/llmthink-server/hosted-main";

export * from "@mako10k/llmthink-server/hosted-main";

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  await startHostedMcpServer(loadHostedMcpRuntimeConfig(process.env));
}
