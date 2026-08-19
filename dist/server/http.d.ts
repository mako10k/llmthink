import { type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { LlmthinkApplicationService } from "./application-service.js";
import { LlmthinkSecurityBoundary, type LlmthinkHostedAuthenticator } from "./security.js";
export declare const DEFAULT_HTTP_REQUEST_LIMIT_BYTES: number;
export declare const DEFAULT_HTTP_RESPONSE_LIMIT_BYTES: number;
export type LlmthinkHttpAuthenticator = LlmthinkHostedAuthenticator;
export interface LlmthinkHttpHandlerOptions {
    readonly application: LlmthinkApplicationService;
    readonly authenticate: LlmthinkHttpAuthenticator;
    readonly security?: LlmthinkSecurityBoundary;
    readonly isReady?: () => boolean | Promise<boolean>;
    readonly requestLimitBytes?: number;
    readonly responseLimitBytes?: number;
}
export declare function createLlmthinkHttpHandler(options: LlmthinkHttpHandlerOptions): (request: IncomingMessage, response: ServerResponse) => Promise<void>;
export declare function createLlmthinkHttpServer(options: LlmthinkHttpHandlerOptions): Server;
