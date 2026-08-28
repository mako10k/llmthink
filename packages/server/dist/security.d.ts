import type { IncomingMessage } from "node:http";
import { type RequestContext, type LlmthinkServerScope } from "./contracts.js";
export declare const DEFAULT_HOSTED_REQUEST_TIMEOUT_MS = 30000;
export declare const DEFAULT_HOSTED_RATE_LIMIT = 120;
export declare const DEFAULT_HOSTED_RATE_WINDOW_MS = 60000;
export declare const DEFAULT_HOSTED_RATE_SUBJECT_LIMIT = 10000;
export declare const DEFAULT_HOSTED_METRIC_SERIES_LIMIT = 256;
export type LlmthinkHostedTransport = "rest" | "mcp";
export type LlmthinkHostedAuthenticator = (request: IncomingMessage) => Promise<RequestContext>;
export interface VerifiedBearerIdentity {
    readonly subjectId: string;
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly scopes: readonly LlmthinkServerScope[];
}
export type LlmthinkBearerTokenVerifier = (token: string) => Promise<VerifiedBearerIdentity>;
export interface BearerAuthenticatorOptions {
    readonly verify: LlmthinkBearerTokenVerifier;
    readonly createRequestId?: () => string;
}
export declare function createBearerTokenAuthenticator(options: BearerAuthenticatorOptions): LlmthinkHostedAuthenticator;
export interface LlmthinkSecurityObservation {
    readonly request_id: string;
    readonly subject: string;
    readonly tenant: string;
    readonly workspace: string;
    readonly transport: LlmthinkHostedTransport;
    readonly operation: string;
    readonly outcome: "success" | "error";
    readonly code: string;
    readonly latency_ms: number;
}
export type LlmthinkSecurityObserver = (observation: LlmthinkSecurityObservation) => void;
export interface LlmthinkSecurityMetric {
    readonly transport: LlmthinkHostedTransport;
    readonly operation: string;
    readonly outcome: "success" | "error";
    readonly code: string;
    readonly count: number;
    readonly latency_ms_total: number;
    readonly latency_ms_max: number;
}
export declare class BoundedLlmthinkSecurityMetrics {
    readonly maxSeries: number;
    private readonly series;
    constructor(maxSeries?: number);
    readonly observe: LlmthinkSecurityObserver;
    snapshot(): readonly LlmthinkSecurityMetric[];
    private dimension;
}
export interface LlmthinkRateLimiter {
    check(context: RequestContext, now: number): void;
}
export interface InMemoryRateLimiterOptions {
    readonly limit?: number;
    readonly windowMs?: number;
    readonly maxSubjects?: number;
}
export declare class InMemoryLlmthinkRateLimiter implements LlmthinkRateLimiter {
    readonly limit: number;
    readonly windowMs: number;
    readonly maxSubjects: number;
    private readonly buckets;
    constructor(options?: InMemoryRateLimiterOptions);
    check(context: RequestContext, now: number): void;
    private evictExpired;
}
export interface LlmthinkSecurityBoundaryOptions {
    readonly authenticate: LlmthinkHostedAuthenticator;
    readonly rateLimiter?: LlmthinkRateLimiter;
    readonly observe?: LlmthinkSecurityObserver;
    readonly timeoutMs?: number;
    readonly now?: () => number;
}
export declare function assertVerifiedRequestContext(context: RequestContext): void;
export declare class LlmthinkSecurityBoundary {
    readonly authenticateRequest: LlmthinkHostedAuthenticator;
    readonly rateLimiter: LlmthinkRateLimiter;
    readonly observe?: LlmthinkSecurityObserver;
    readonly timeoutMs: number;
    readonly now: () => number;
    constructor(options: LlmthinkSecurityBoundaryOptions);
    authenticate(request: IncomingMessage): Promise<RequestContext>;
    execute<T>(context: RequestContext, transport: LlmthinkHostedTransport, operation: string, action: () => Promise<T>): Promise<T>;
    private record;
    private withTimeout;
}
