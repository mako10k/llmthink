import { createHash, randomUUID } from "node:crypto";
import { assertHostedId, LLMTHINK_SERVER_SCOPES, LlmthinkServerError, } from "./contracts.js";
export const DEFAULT_HOSTED_REQUEST_TIMEOUT_MS = 30_000;
export const DEFAULT_HOSTED_RATE_LIMIT = 120;
export const DEFAULT_HOSTED_RATE_WINDOW_MS = 60_000;
export const DEFAULT_HOSTED_RATE_SUBJECT_LIMIT = 10_000;
export const DEFAULT_HOSTED_METRIC_SERIES_LIMIT = 256;
export function createBearerTokenAuthenticator(options) {
    return async (request) => {
        const authorization = request.headers.authorization;
        const match = typeof authorization === "string"
            ? /^Bearer ([^\s]+)$/.exec(authorization)
            : null;
        if (!match) {
            throw new LlmthinkServerError("unauthenticated", "Bearer authentication is required");
        }
        let identity;
        try {
            identity = await options.verify(match[1]);
        }
        catch {
            throw new LlmthinkServerError("unauthenticated", "Bearer token verification failed");
        }
        return {
            ...identity,
            requestId: (options.createRequestId ?? randomUUID)(),
        };
    };
}
export class BoundedLlmthinkSecurityMetrics {
    maxSeries;
    series = new Map();
    constructor(maxSeries = DEFAULT_HOSTED_METRIC_SERIES_LIMIT) {
        if (!Number.isSafeInteger(maxSeries) || maxSeries < 1) {
            throw new LlmthinkServerError("invalid_argument", "Metric series limit must be a positive safe integer");
        }
        this.maxSeries = maxSeries;
    }
    observe = (observation) => {
        const dimensions = {
            transport: observation.transport,
            operation: this.dimension(observation.operation),
            outcome: observation.outcome,
            code: this.dimension(observation.code),
        };
        const key = `${dimensions.transport}\u0000${dimensions.operation}\u0000${dimensions.outcome}\u0000${dimensions.code}`;
        const current = this.series.get(key);
        if (!current && this.series.size >= this.maxSeries)
            return;
        this.series.set(key, {
            ...dimensions,
            count: (current?.count ?? 0) + 1,
            latency_ms_total: (current?.latency_ms_total ?? 0) + observation.latency_ms,
            latency_ms_max: Math.max(current?.latency_ms_max ?? 0, observation.latency_ms),
        });
    };
    snapshot() {
        return [...this.series.values()].map((metric) => ({ ...metric }));
    }
    dimension(value) {
        return /^[A-Za-z0-9_ -]{1,80}$/.test(value) ? value : "unknown";
    }
}
export class InMemoryLlmthinkRateLimiter {
    limit;
    windowMs;
    maxSubjects;
    buckets = new Map();
    constructor(options = {}) {
        this.limit = options.limit ?? DEFAULT_HOSTED_RATE_LIMIT;
        this.windowMs = options.windowMs ?? DEFAULT_HOSTED_RATE_WINDOW_MS;
        this.maxSubjects = options.maxSubjects ?? DEFAULT_HOSTED_RATE_SUBJECT_LIMIT;
        if (!Number.isSafeInteger(this.limit) ||
            this.limit < 1 ||
            !Number.isSafeInteger(this.windowMs) ||
            this.windowMs < 1 ||
            !Number.isSafeInteger(this.maxSubjects) ||
            this.maxSubjects < 1) {
            throw new LlmthinkServerError("invalid_argument", "Rate limiter bounds must be positive safe integers");
        }
    }
    check(context, now) {
        this.evictExpired(now);
        const key = `${context.tenantId}\u0000${context.subjectId}`;
        let bucket = this.buckets.get(key);
        if (!bucket) {
            if (this.buckets.size >= this.maxSubjects) {
                throw new LlmthinkServerError("rate_limited", "Rate limiter subject capacity is exhausted");
            }
            bucket = { count: 0, resetAt: now + this.windowMs };
            this.buckets.set(key, bucket);
        }
        if (bucket.count >= this.limit) {
            throw new LlmthinkServerError("rate_limited", "Request rate exceeded", {
                retryAfterMs: Math.max(1, bucket.resetAt - now),
            });
        }
        bucket.count += 1;
    }
    evictExpired(now) {
        for (const [key, bucket] of this.buckets) {
            if (bucket.resetAt <= now)
                this.buckets.delete(key);
        }
    }
}
const KNOWN_SCOPES = new Set(LLMTHINK_SERVER_SCOPES);
export function assertVerifiedRequestContext(context) {
    if (!context || typeof context !== "object") {
        throw new LlmthinkServerError("unauthenticated", "Verified request context is required");
    }
    for (const [field, value] of [
        ["subjectId", context.subjectId],
        ["tenantId", context.tenantId],
        ["workspaceId", context.workspaceId],
        ["requestId", context.requestId],
    ]) {
        if (typeof value !== "string" || value.length === 0) {
            throw new LlmthinkServerError("unauthenticated", `Verified ${field} is required`);
        }
        assertHostedId(field, value);
    }
    if (!Array.isArray(context.scopes) ||
        context.scopes.some((scope) => !KNOWN_SCOPES.has(scope))) {
        throw new LlmthinkServerError("forbidden", "Verified request context contains an unsupported scope");
    }
}
function pseudonym(value) {
    return createHash("sha256").update(value).digest("hex").slice(0, 16);
}
function errorCode(error) {
    return error instanceof LlmthinkServerError ? error.code : "internal";
}
export class LlmthinkSecurityBoundary {
    authenticateRequest;
    rateLimiter;
    observe;
    timeoutMs;
    now;
    constructor(options) {
        this.authenticateRequest = options.authenticate;
        this.rateLimiter = options.rateLimiter ?? new InMemoryLlmthinkRateLimiter();
        this.observe = options.observe;
        this.timeoutMs = options.timeoutMs ?? DEFAULT_HOSTED_REQUEST_TIMEOUT_MS;
        this.now = options.now ?? Date.now;
        if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1) {
            throw new LlmthinkServerError("invalid_argument", "Request timeout must be a positive safe integer");
        }
    }
    async authenticate(request) {
        const context = await this.withTimeout(this.authenticateRequest(request), "Authentication timed out");
        assertVerifiedRequestContext(context);
        this.rateLimiter.check(context, this.now());
        return context;
    }
    async execute(context, transport, operation, action) {
        const startedAt = this.now();
        try {
            const result = await this.withTimeout(action(), "Request timed out");
            this.record(context, transport, operation, "success", "ok", startedAt);
            return result;
        }
        catch (error) {
            this.record(context, transport, operation, "error", errorCode(error), startedAt);
            throw error;
        }
    }
    record(context, transport, operation, outcome, code, startedAt) {
        this.observe?.({
            request_id: context.requestId,
            subject: pseudonym(context.subjectId),
            tenant: pseudonym(context.tenantId),
            workspace: pseudonym(context.workspaceId),
            transport,
            operation,
            outcome,
            code,
            latency_ms: Math.max(0, this.now() - startedAt),
        });
    }
    async withTimeout(promise, message) {
        let timer;
        try {
            return await Promise.race([
                promise,
                new Promise((_resolve, reject) => {
                    timer = setTimeout(() => reject(new LlmthinkServerError("internal", message)), this.timeoutMs);
                }),
            ]);
        }
        finally {
            if (timer)
                clearTimeout(timer);
        }
    }
}
//# sourceMappingURL=security.js.map