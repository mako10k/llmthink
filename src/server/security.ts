import { createHash, randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";

import {
  assertHostedId,
  LLMTHINK_SERVER_SCOPES,
  LlmthinkServerError,
  type RequestContext,
  type LlmthinkServerScope,
} from "./contracts.js";

export const DEFAULT_HOSTED_REQUEST_TIMEOUT_MS = 30_000;
export const DEFAULT_HOSTED_RATE_LIMIT = 120;
export const DEFAULT_HOSTED_RATE_WINDOW_MS = 60_000;
export const DEFAULT_HOSTED_RATE_SUBJECT_LIMIT = 10_000;
export const DEFAULT_HOSTED_METRIC_SERIES_LIMIT = 256;

export type LlmthinkHostedTransport = "rest" | "mcp";
export type LlmthinkHostedAuthenticator = (
  request: IncomingMessage,
) => Promise<RequestContext>;

export interface VerifiedBearerIdentity {
  readonly subjectId: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly scopes: readonly LlmthinkServerScope[];
}

export type LlmthinkBearerTokenVerifier = (
  token: string,
) => Promise<VerifiedBearerIdentity>;

export interface BearerAuthenticatorOptions {
  readonly verify: LlmthinkBearerTokenVerifier;
  readonly createRequestId?: () => string;
}

export function createBearerTokenAuthenticator(
  options: BearerAuthenticatorOptions,
): LlmthinkHostedAuthenticator {
  return async (request) => {
    const authorization = request.headers.authorization;
    const match =
      typeof authorization === "string"
        ? /^Bearer ([^\s]+)$/.exec(authorization)
        : null;
    if (!match) {
      throw new LlmthinkServerError(
        "unauthenticated",
        "Bearer authentication is required",
      );
    }
    let identity: VerifiedBearerIdentity;
    try {
      identity = await options.verify(match[1]);
    } catch {
      throw new LlmthinkServerError(
        "unauthenticated",
        "Bearer token verification failed",
      );
    }
    return {
      ...identity,
      requestId: (options.createRequestId ?? randomUUID)(),
    };
  };
}

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

export type LlmthinkSecurityObserver = (
  observation: LlmthinkSecurityObservation,
) => void;

export interface LlmthinkSecurityMetric {
  readonly transport: LlmthinkHostedTransport;
  readonly operation: string;
  readonly outcome: "success" | "error";
  readonly code: string;
  readonly count: number;
  readonly latency_ms_total: number;
  readonly latency_ms_max: number;
}

export class BoundedLlmthinkSecurityMetrics {
  readonly maxSeries: number;
  private readonly series = new Map<string, LlmthinkSecurityMetric>();

  constructor(maxSeries = DEFAULT_HOSTED_METRIC_SERIES_LIMIT) {
    if (!Number.isSafeInteger(maxSeries) || maxSeries < 1) {
      throw new LlmthinkServerError(
        "invalid_argument",
        "Metric series limit must be a positive safe integer",
      );
    }
    this.maxSeries = maxSeries;
  }

  readonly observe: LlmthinkSecurityObserver = (observation) => {
    const dimensions = {
      transport: observation.transport,
      operation: this.dimension(observation.operation),
      outcome: observation.outcome,
      code: this.dimension(observation.code),
    } as const;
    const key = `${dimensions.transport}\u0000${dimensions.operation}\u0000${dimensions.outcome}\u0000${dimensions.code}`;
    const current = this.series.get(key);
    if (!current && this.series.size >= this.maxSeries) return;
    this.series.set(key, {
      ...dimensions,
      count: (current?.count ?? 0) + 1,
      latency_ms_total:
        (current?.latency_ms_total ?? 0) + observation.latency_ms,
      latency_ms_max: Math.max(
        current?.latency_ms_max ?? 0,
        observation.latency_ms,
      ),
    });
  };

  snapshot(): readonly LlmthinkSecurityMetric[] {
    return [...this.series.values()].map((metric) => ({ ...metric }));
  }

  private dimension(value: string): string {
    return /^[A-Za-z0-9_ -]{1,80}$/.test(value) ? value : "unknown";
  }
}

export interface LlmthinkRateLimiter {
  check(context: RequestContext, now: number): void;
}

export interface InMemoryRateLimiterOptions {
  readonly limit?: number;
  readonly windowMs?: number;
  readonly maxSubjects?: number;
}

interface RateBucket {
  count: number;
  resetAt: number;
}

export class InMemoryLlmthinkRateLimiter implements LlmthinkRateLimiter {
  readonly limit: number;
  readonly windowMs: number;
  readonly maxSubjects: number;
  private readonly buckets = new Map<string, RateBucket>();

  constructor(options: InMemoryRateLimiterOptions = {}) {
    this.limit = options.limit ?? DEFAULT_HOSTED_RATE_LIMIT;
    this.windowMs = options.windowMs ?? DEFAULT_HOSTED_RATE_WINDOW_MS;
    this.maxSubjects = options.maxSubjects ?? DEFAULT_HOSTED_RATE_SUBJECT_LIMIT;
    if (
      !Number.isSafeInteger(this.limit) ||
      this.limit < 1 ||
      !Number.isSafeInteger(this.windowMs) ||
      this.windowMs < 1 ||
      !Number.isSafeInteger(this.maxSubjects) ||
      this.maxSubjects < 1
    ) {
      throw new LlmthinkServerError(
        "invalid_argument",
        "Rate limiter bounds must be positive safe integers",
      );
    }
  }

  check(context: RequestContext, now: number): void {
    this.evictExpired(now);
    const key = `${context.tenantId}\u0000${context.subjectId}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= this.maxSubjects) {
        throw new LlmthinkServerError(
          "rate_limited",
          "Rate limiter subject capacity is exhausted",
        );
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

  private evictExpired(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

export interface LlmthinkSecurityBoundaryOptions {
  readonly authenticate: LlmthinkHostedAuthenticator;
  readonly rateLimiter?: LlmthinkRateLimiter;
  readonly observe?: LlmthinkSecurityObserver;
  readonly timeoutMs?: number;
  readonly now?: () => number;
}

const KNOWN_SCOPES = new Set<string>(LLMTHINK_SERVER_SCOPES);

export function assertVerifiedRequestContext(context: RequestContext): void {
  if (!context || typeof context !== "object") {
    throw new LlmthinkServerError(
      "unauthenticated",
      "Verified request context is required",
    );
  }
  for (const [field, value] of [
    ["subjectId", context.subjectId],
    ["tenantId", context.tenantId],
    ["workspaceId", context.workspaceId],
    ["requestId", context.requestId],
  ] as const) {
    if (typeof value !== "string" || value.length === 0) {
      throw new LlmthinkServerError(
        "unauthenticated",
        `Verified ${field} is required`,
      );
    }
    assertHostedId(field, value);
  }
  if (
    !Array.isArray(context.scopes) ||
    context.scopes.some((scope) => !KNOWN_SCOPES.has(scope))
  ) {
    throw new LlmthinkServerError(
      "forbidden",
      "Verified request context contains an unsupported scope",
    );
  }
}

function pseudonym(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function errorCode(error: unknown): string {
  return error instanceof LlmthinkServerError ? error.code : "internal";
}

export class LlmthinkSecurityBoundary {
  readonly authenticateRequest: LlmthinkHostedAuthenticator;
  readonly rateLimiter: LlmthinkRateLimiter;
  readonly observe?: LlmthinkSecurityObserver;
  readonly timeoutMs: number;
  readonly now: () => number;

  constructor(options: LlmthinkSecurityBoundaryOptions) {
    this.authenticateRequest = options.authenticate;
    this.rateLimiter = options.rateLimiter ?? new InMemoryLlmthinkRateLimiter();
    this.observe = options.observe;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_HOSTED_REQUEST_TIMEOUT_MS;
    this.now = options.now ?? Date.now;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1) {
      throw new LlmthinkServerError(
        "invalid_argument",
        "Request timeout must be a positive safe integer",
      );
    }
  }

  async authenticate(request: IncomingMessage): Promise<RequestContext> {
    const context = await this.withTimeout(
      this.authenticateRequest(request),
      "Authentication timed out",
    );
    assertVerifiedRequestContext(context);
    this.rateLimiter.check(context, this.now());
    return context;
  }

  async execute<T>(
    context: RequestContext,
    transport: LlmthinkHostedTransport,
    operation: string,
    action: () => Promise<T>,
  ): Promise<T> {
    const startedAt = this.now();
    try {
      const result = await this.withTimeout(action(), "Request timed out");
      this.record(context, transport, operation, "success", "ok", startedAt);
      return result;
    } catch (error) {
      this.record(
        context,
        transport,
        operation,
        "error",
        errorCode(error),
        startedAt,
      );
      throw error;
    }
  }

  private record(
    context: RequestContext,
    transport: LlmthinkHostedTransport,
    operation: string,
    outcome: "success" | "error",
    code: string,
    startedAt: number,
  ): void {
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

  private async withTimeout<T>(
    promise: Promise<T>,
    message: string,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new LlmthinkServerError("internal", message)),
            this.timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
