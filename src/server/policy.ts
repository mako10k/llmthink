import { isIP } from "node:net";

import { LlmthinkServerError } from "./contracts.js";

export const LLMTHINK_SERVER_HTTP_STACK = {
  server: "node:http",
  mcpTransport:
    "@modelcontextprotocol/sdk/server/streamableHttp.js#StreamableHTTPServerTransport",
} as const;

export interface ServerBindPolicyInput {
  readonly hostname: string;
  readonly authenticationEnabled: boolean;
}

export function isExplicitLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (normalized === "localhost") {
    return true;
  }
  const withoutBrackets =
    normalized.startsWith("[") && normalized.endsWith("]")
      ? normalized.slice(1, -1)
      : normalized;
  const ipVersion = isIP(withoutBrackets);
  if (ipVersion === 4) {
    return withoutBrackets.startsWith("127.");
  }
  return ipVersion === 6 && withoutBrackets === "::1";
}

export function assertServerBindPolicy(input: ServerBindPolicyInput): void {
  if (
    !input.authenticationEnabled &&
    !isExplicitLoopbackHostname(input.hostname)
  ) {
    throw new LlmthinkServerError(
      "forbidden",
      "Authentication-disabled server must bind to an explicit loopback hostname",
      { field: "hostname" },
    );
  }
}
