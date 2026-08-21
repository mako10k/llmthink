import { createHash } from "node:crypto";
const ARCHIVE_FORMAT = "llmthink-archive-v1";
export class LlmthinkArchiveService {
    #repository;
    #lifecycle;
    #maxBytes;
    #maxItems;
    constructor(options) {
        this.#repository = options.repository;
        this.#lifecycle = options.lifecycle;
        this.#maxBytes = boundedMaximum(options.maxBytes ?? 10 * 1024 * 1024);
        this.#maxItems = boundedMaximum(options.maxItems ?? 10_000);
    }
    async create(identity) {
        const context = this.#lifecycle.archiveContext(identity);
        const items = await this.#readAll(context);
        const bytes = Buffer.from(`${canonicalJson({ format: ARCHIVE_FORMAT, thoughts: items })}\n`, "utf8");
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
    async #readAll(context) {
        const items = [];
        let cursor;
        do {
            const page = await this.#repository.list({
                limit: Math.min(100, this.#maxItems - items.length),
                ...(cursor ? { cursor } : {}),
            }, context);
            items.push(...page.items);
            if (items.length > this.#maxItems) {
                throw new Error("Archive exceeds the configured item limit");
            }
            if (page.nextCursor !== undefined && page.nextCursor === cursor) {
                throw new Error("Archive repository cursor did not advance");
            }
            cursor = page.nextCursor;
        } while (cursor && items.length < this.#maxItems);
        if (cursor)
            throw new Error("Archive exceeds the configured item limit");
        return items;
    }
}
function boundedMaximum(value) {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new Error("Archive limit must be a positive safe integer");
    }
    return value;
}
function canonicalJson(value) {
    if (value === null || typeof value !== "object")
        return JSON.stringify(value);
    if (Array.isArray(value))
        return `[${value.map(canonicalJson).join(",")}]`;
    const record = value;
    return `{${Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
        .join(",")}}`;
}
//# sourceMappingURL=archive-service.js.map