import { type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { LlmthinkApplicationService } from "./application-service.js";
import type { LlmthinkHttpAuthenticator } from "./http.js";
import { type LlmthinkOAuthDiscovery } from "./oauth-discovery.js";
import { LlmthinkSecurityBoundary } from "./security.js";
export declare const DEFAULT_MCP_REQUEST_LIMIT_BYTES: number;
export declare const DEFAULT_MCP_TEXT_LIMIT_BYTES: number;
export interface LlmthinkHostedMcpHandlerOptions {
    readonly application: LlmthinkApplicationService;
    readonly authenticate: LlmthinkHttpAuthenticator;
    readonly security?: LlmthinkSecurityBoundary;
    readonly oauthDiscovery?: LlmthinkOAuthDiscovery;
    readonly requestLimitBytes?: number;
    readonly textLimitBytes?: number;
}
export declare function createLlmthinkHostedMcpHandler(options: LlmthinkHostedMcpHandlerOptions): (request: IncomingMessage, response: ServerResponse) => Promise<void>;
export declare function createLlmthinkHostedMcpServer(options: LlmthinkHostedMcpHandlerOptions): Server;
