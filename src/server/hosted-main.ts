#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  loadHostedMcpRuntimeConfig,
  startHostedMcpServer,
} from "@llmthink/server/hosted-main";

export * from "@llmthink/server/hosted-main";

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  await startHostedMcpServer(loadHostedMcpRuntimeConfig(process.env));
}
