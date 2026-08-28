import { type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { LlmthinkApplicationService } from "./application-service.js";
import type { LlmthinkHttpAuthenticator } from "./http.js";
import { LlmthinkSecurityBoundary } from "./security.js";
export declare const DEFAULT_MCP_REQUEST_LIMIT_BYTES: number;
export declare const DEFAULT_MCP_TEXT_LIMIT_BYTES: number;
export interface LlmthinkOnboardingPrincipal {
    readonly identity: {
        readonly issuer: string;
        readonly subjectId: string;
        readonly organizationId?: string;
    };
    readonly requestId: string;
}
export interface LlmthinkOnboardingMcpOptions {
    readonly authenticate: (request: IncomingMessage) => Promise<LlmthinkOnboardingPrincipal>;
    readonly issueUrl: (principal: LlmthinkOnboardingPrincipal) => string;
}
export interface LlmthinkHostedMcpHandlerOptions {
    readonly application: LlmthinkApplicationService;
    readonly authenticate: LlmthinkHttpAuthenticator;
    readonly security?: LlmthinkSecurityBoundary;
    readonly requestLimitBytes?: number;
    readonly textLimitBytes?: number;
    readonly onboardingMcp?: LlmthinkOnboardingMcpOptions;
}
export declare function createLlmthinkHostedMcpHandler(options: LlmthinkHostedMcpHandlerOptions): (request: IncomingMessage, response: ServerResponse) => Promise<void>;
export declare function createLlmthinkHostedMcpServer(options: LlmthinkHostedMcpHandlerOptions): Server;
