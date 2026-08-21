import { createHash } from "node:crypto";

import type { RequestContext, ThoughtRepository } from "./contracts.js";
import type { LlmthinkExternalOAuthIdentity } from "./oauth-jwt.js";
import type {
  ArchiveAccessContext,
  ArchiveReceipt,
} from "./sqlite-lifecycle-store.js";

const ARCHIVE_FORMAT = "llmthink-archive-v1" as const;

export interface ArchiveLifecycleAuthority {
  archiveContext(identity: LlmthinkExternalOAuthIdentity): ArchiveAccessContext;
  recordArchive(
    identity: LlmthinkExternalOAuthIdentity,
    input: {
      readonly contentSha256: string;
      readonly byteLength: number;
      readonly itemCount: number;
    },
  ): ArchiveReceipt;
}

export interface LlmthinkArchive {
  readonly contentType: "application/json; charset=utf-8";
  readonly bytes: Uint8Array;
  readonly receipt: ArchiveReceipt;
}

export interface LlmthinkArchiveServiceOptions {
  readonly repository: ThoughtRepository;
  readonly lifecycle: ArchiveLifecycleAuthority;
  readonly maxBytes?: number;
  readonly maxItems?: number;
}

export class LlmthinkArchiveService {
  readonly #repository: ThoughtRepository;
  readonly #lifecycle: ArchiveLifecycleAuthority;
  readonly #maxBytes: number;
  readonly #maxItems: number;

  constructor(options: LlmthinkArchiveServiceOptions) {
    this.#repository = options.repository;
    this.#lifecycle = options.lifecycle;
    this.#maxBytes = boundedMaximum(options.maxBytes ?? 10 * 1024 * 1024);
    this.#maxItems = boundedMaximum(options.maxItems ?? 10_000);
  }

  async create(
    identity: LlmthinkExternalOAuthIdentity,
  ): Promise<LlmthinkArchive> {
    const context = this.#lifecycle.archiveContext(identity);
    const items = await this.#readAll(context);
    const bytes = Buffer.from(
      `${canonicalJson({ format: ARCHIVE_FORMAT, thoughts: items })}\n`,
      "utf8",
    );
    if (bytes.byteLength > this.#maxBytes) {
      throw new Error("Archive exceeds the configured size limit");
    }
    const contentSha256 = createHash("sha256").update(bytes).digest("hex");
    const receipt = this.#lifecycle.recordArchive(identity, {
      contentSha256,
      byteLength: bytes.byteLength,
      itemCount: items.length,
    });
    return Object.freeze({
      contentType: "application/json; charset=utf-8",
      bytes,
      receipt,
    });
  }

  async #readAll(context: RequestContext): Promise<readonly unknown[]> {
    const items: unknown[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.#repository.list(
        {
          limit: Math.min(100, this.#maxItems - items.length),
          ...(cursor ? { cursor } : {}),
        },
        context,
      );
      items.push(...page.items);
      if (items.length > this.#maxItems) {
        throw new Error("Archive exceeds the configured item limit");
      }
      if (page.nextCursor !== undefined && page.nextCursor === cursor) {
        throw new Error("Archive repository cursor did not advance");
      }
      cursor = page.nextCursor;
    } while (cursor && items.length < this.#maxItems);
    if (cursor) throw new Error("Archive exceeds the configured item limit");
    return items;
  }
}

function boundedMaximum(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("Archive limit must be a positive safe integer");
  }
  return value;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}
