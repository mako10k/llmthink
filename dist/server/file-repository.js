import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile, } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { assertCommandIdentity, assertHostedId, assertIdempotencyRetention, assertRevision, assertThoughtRef, DEFAULT_IDEMPOTENCY_RETENTION_SECONDS, LLMTHINK_SERVER_FILE_SCHEMA_VERSION, LlmthinkServerError, } from "./contracts.js";
function json(value) {
    return `${JSON.stringify(value, null, 2)}\n`;
}
function revisionName(revision) {
    return revision.toString().padStart(16, "0");
}
function digest(value) {
    return createHash("sha256").update(value).digest("hex");
}
async function exists(path) {
    try {
        await stat(path);
        return true;
    }
    catch (error) {
        if (error.code === "ENOENT")
            return false;
        throw error;
    }
}
async function readOptional(path) {
    try {
        return await readFile(path, "utf8");
    }
    catch (error) {
        if (error.code === "ENOENT")
            return undefined;
        throw error;
    }
}
async function syncPath(path) {
    const handle = await open(path, "r");
    try {
        await handle.sync();
    }
    finally {
        await handle.close();
    }
}
function parseJson(text, subject) {
    try {
        return JSON.parse(text);
    }
    catch {
        throw new LlmthinkServerError("storage_corrupt", `Invalid ${subject}`);
    }
}
function assertSchema(value, subject) {
    if (value.schema_version !== LLMTHINK_SERVER_FILE_SCHEMA_VERSION) {
        throw new LlmthinkServerError("unsupported_schema_version", `Unsupported ${subject} schema version`);
    }
}
function assertContext(context) {
    assertHostedId("subjectId", context.subjectId);
    assertHostedId("tenantId", context.tenantId);
    assertHostedId("workspaceId", context.workspaceId);
    assertHostedId("requestId", context.requestId);
}
export class ServerFileThoughtRepository {
    dataRoot;
    idempotencyRetentionSeconds;
    clock;
    writes = new Map();
    constructor(options) {
        if (!options.dataRoot || !isAbsolute(options.dataRoot)) {
            throw new LlmthinkServerError("invalid_argument", "dataRoot must be an explicit absolute path");
        }
        this.dataRoot = resolve(options.dataRoot);
        this.idempotencyRetentionSeconds =
            options.idempotencyRetentionSeconds ??
                DEFAULT_IDEMPOTENCY_RETENTION_SECONDS;
        assertIdempotencyRetention(this.idempotencyRetentionSeconds);
        this.clock = options.clock ?? (() => new Date());
    }
    async create(command, context) {
        assertContext(context);
        assertHostedId("thoughtId", command.thoughtId);
        assertCommandIdentity(command.identity);
        const ref = this.ref(context, command.thoughtId);
        return this.serialized(ref, async () => {
            const replay = await this.idempotentReplay(ref, "create", command.identity, context);
            if (replay)
                return replay;
            if (await exists(this.currentPath(ref))) {
                throw new LlmthinkServerError("revision_conflict", "Thought already exists");
            }
            const at = this.clock().toISOString();
            const revision = {
                record: {
                    schema_version: LLMTHINK_SERVER_FILE_SCHEMA_VERSION,
                    tenant_id: ref.tenantId,
                    workspace_id: ref.workspaceId,
                    thought_id: ref.thoughtId,
                    revision: 1,
                    status: "draft",
                    created_at: at,
                    updated_at: at,
                    has_draft: true,
                    has_final: false,
                },
                draftText: command.draftText,
                events: [{ at, kind: "draft_saved", summary: "Draft created" }],
                reflections: [],
            };
            const result = await this.commit(ref, revision, this.commandRecord("create", command.identity, context));
            await this.remember(ref, "create", command.identity, result.revision, context);
            return result;
        });
    }
    async get(ref, context) {
        assertContext(context);
        assertThoughtRef(ref, context);
        if (!(await exists(this.currentPath(ref))))
            return null;
        return this.readCurrent(ref);
    }
    async list(query, context) {
        assertContext(context);
        this.assertPageQuery(query.limit);
        const thoughtsDir = this.thoughtsPath(context);
        let ids = [];
        try {
            ids = (await readdir(thoughtsDir, { withFileTypes: true }))
                .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
                .map((entry) => entry.name)
                .sort();
        }
        catch (error) {
            if (error.code !== "ENOENT")
                throw error;
        }
        const after = query.cursor ? this.decodeCursor(query.cursor) : undefined;
        const items = [];
        let nextCursor;
        for (const id of ids) {
            if (after && id <= after)
                continue;
            const snapshot = await this.get(this.ref(context, id), context);
            if (!snapshot ||
                (query.status && snapshot.record.status !== query.status))
                continue;
            if (items.length === query.limit) {
                nextCursor = this.encodeCursor(items.at(-1).record.id);
                break;
            }
            items.push(snapshot);
        }
        return { items, ...(nextCursor ? { nextCursor } : {}) };
    }
    async search(query, context) {
        if (!query.query.trim()) {
            throw new LlmthinkServerError("invalid_argument", "query must not be empty");
        }
        const page = await this.list({ cursor: query.cursor, limit: query.limit }, context);
        const needle = query.query.toLocaleLowerCase();
        const items = page.items.filter((item) => {
            const text = [item.draftText, item.finalText];
            if (query.includeReflections)
                text.push(...item.reflections.map((r) => r.text));
            return text.some((value) => value?.toLocaleLowerCase().includes(needle));
        });
        return {
            items,
            ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
        };
    }
    async saveDraft(command, context) {
        return this.update("saveDraft", command, context, (current, at) => ({
            ...current,
            draftText: command.draftText,
            record: {
                ...current.record,
                status: "draft",
                has_draft: true,
                updated_at: at,
            },
            events: [
                ...current.events,
                { at, kind: "draft_saved", summary: "Draft saved" },
            ],
        }));
    }
    async recordAudit(command, context) {
        return this.update("recordAudit", command, context, (current, at) => ({
            ...current,
            latestAudit: command.report,
            record: {
                ...current.record,
                latest_audit_id: digest(JSON.stringify(command.report)),
                updated_at: at,
            },
            events: [
                ...current.events,
                { at, kind: "audit_recorded", summary: "Audit recorded" },
            ],
        }));
    }
    async finalize(command, context) {
        if (!command.confirmationToken) {
            throw new LlmthinkServerError("confirmation_required", "Finalization requires confirmation");
        }
        return this.update("finalize", command, context, (current, at) => ({
            ...current,
            finalText: command.finalText,
            record: {
                ...current.record,
                status: "finalized",
                has_final: true,
                updated_at: at,
            },
            events: [
                ...current.events,
                { at, kind: "finalized", summary: "Thought finalized" },
            ],
        }));
    }
    async addReflection(command, context) {
        return this.update("addReflection", command, context, (current, at) => ({
            ...current,
            record: { ...current.record, updated_at: at },
            reflections: [
                ...current.reflections,
                { id: randomUUID(), at, kind: command.kind, text: command.text },
            ],
            events: [
                ...current.events,
                { at, kind: "reflect_recorded", summary: "Reflection recorded" },
            ],
        }));
    }
    async events(ref, context) {
        const snapshot = await this.get(ref, context);
        if (!snapshot)
            throw new LlmthinkServerError("not_found", "Thought not found");
        return snapshot.history;
    }
    async update(operation, command, context, mutate) {
        assertContext(context);
        assertThoughtRef(command.ref, context);
        assertRevision(command.expectedRevision);
        assertCommandIdentity(command.identity);
        return this.serialized(command.ref, async () => {
            const replay = await this.idempotentReplay(command.ref, operation, command.identity, context);
            if (replay)
                return replay;
            const current = await this.readFiles(command.ref);
            if (current.record.revision !== command.expectedRevision) {
                throw new LlmthinkServerError("revision_conflict", "Expected revision does not match", {
                    expectedRevision: command.expectedRevision,
                    actualRevision: current.record.revision,
                });
            }
            const at = this.clock().toISOString();
            const next = mutate(current, at);
            const revision = {
                record: { ...next.record, revision: current.record.revision + 1 },
                draftText: next.draftText,
                finalText: next.finalText,
                semanticAuditText: next.semanticAuditText,
                audit: next.latestAudit,
                events: next.events,
                reflections: next.reflections,
            };
            const result = await this.commit(command.ref, revision, this.commandRecord(operation, command.identity, context));
            await this.remember(command.ref, operation, command.identity, result.revision, context);
            return result;
        });
    }
    async commit(ref, revision, command) {
        const thought = this.thoughtPath(ref);
        const revisions = join(thought, "revisions");
        await mkdir(revisions, { recursive: true });
        const name = revisionName(revision.record.revision);
        const target = join(revisions, name);
        const temporary = join(revisions, `.tmp-${name}-${randomUUID()}`);
        await mkdir(join(temporary, "audits"), { recursive: true });
        try {
            await this.writeRevisionFiles(temporary, revision, command);
            await syncPath(join(temporary, "audits"));
            await syncPath(temporary);
            if (await exists(target)) {
                const orphanCommand = await this.readRevisionCommand(target);
                if (!this.sameCommand(orphanCommand, command)) {
                    throw new LlmthinkServerError("storage_corrupt", "Next revision already exists without matching recovery evidence");
                }
                await rm(target, { recursive: true });
            }
            await rename(temporary, target);
            await syncPath(revisions);
            const pointer = {
                schema_version: LLMTHINK_SERVER_FILE_SCHEMA_VERSION,
                revision: revision.record.revision,
            };
            const pointerTemp = join(thought, `.CURRENT-${randomUUID()}`);
            await writeFile(pointerTemp, json(pointer), "utf8");
            await syncPath(pointerTemp);
            await rename(pointerTemp, this.currentPath(ref));
            await syncPath(thought);
        }
        catch (error) {
            await rm(temporary, { recursive: true, force: true });
            if (error instanceof LlmthinkServerError)
                throw error;
            throw new LlmthinkServerError("internal", "Could not commit thought revision");
        }
        return this.readRevision(ref, revision.record.revision);
    }
    async writeRevisionFiles(directory, revision, command) {
        const writes = [
            ["record.json", json(revision.record)],
            ["command.json", json(command)],
            [
                "events.jsonl",
                revision.events.map((event) => JSON.stringify(event)).join("\n") + "\n",
            ],
            [
                "reflections.jsonl",
                revision.reflections
                    .map((reflection) => JSON.stringify(reflection))
                    .join("\n") + "\n",
            ],
        ];
        if (revision.draftText !== undefined)
            writes.push(["draft.think", revision.draftText]);
        if (revision.finalText !== undefined)
            writes.push(["final.think", revision.finalText]);
        if (revision.semanticAuditText !== undefined)
            writes.push(["semantic-audit.think", revision.semanticAuditText]);
        if (revision.audit !== undefined) {
            const auditId = revision.record.latest_audit_id ??
                digest(JSON.stringify(revision.audit));
            writes.push([join("audits", `${auditId}.json`), json(revision.audit)]);
        }
        for (const [relative, content] of writes) {
            const path = join(directory, relative);
            await writeFile(path, content, "utf8");
            await syncPath(path);
        }
    }
    async readCurrent(ref) {
        const text = await readOptional(this.currentPath(ref));
        if (text === undefined)
            throw new LlmthinkServerError("not_found", "Thought not found");
        const pointer = parseJson(text, "CURRENT pointer");
        assertSchema(pointer, "CURRENT pointer");
        if (!Number.isSafeInteger(pointer.revision) || pointer.revision < 1) {
            throw new LlmthinkServerError("storage_corrupt", "Invalid CURRENT revision");
        }
        return this.readRevision(ref, pointer.revision);
    }
    async readFiles(ref) {
        const snapshot = await this.readCurrent(ref);
        return {
            record: {
                schema_version: LLMTHINK_SERVER_FILE_SCHEMA_VERSION,
                tenant_id: snapshot.tenantId,
                workspace_id: snapshot.workspaceId,
                thought_id: snapshot.record.id,
                revision: snapshot.revision,
                status: snapshot.record.status,
                created_at: snapshot.record.created_at,
                updated_at: snapshot.record.updated_at,
                has_draft: snapshot.draftText !== undefined,
                has_final: snapshot.finalText !== undefined,
                ...(snapshot.latestAudit
                    ? { latest_audit_id: digest(JSON.stringify(snapshot.latestAudit)) }
                    : {}),
            },
            draftText: snapshot.draftText,
            finalText: snapshot.finalText,
            semanticAuditText: snapshot.semanticAuditText,
            latestAudit: snapshot.latestAudit,
            events: [...snapshot.history],
            reflections: [...snapshot.reflections],
        };
    }
    async readRevision(ref, revision) {
        const directory = join(this.thoughtPath(ref), "revisions", revisionName(revision));
        const recordText = await readOptional(join(directory, "record.json"));
        const eventsText = await readOptional(join(directory, "events.jsonl"));
        const reflectionsText = await readOptional(join(directory, "reflections.jsonl"));
        if (recordText === undefined ||
            eventsText === undefined ||
            reflectionsText === undefined) {
            throw new LlmthinkServerError("storage_corrupt", "CURRENT points to an incomplete revision");
        }
        const record = parseJson(recordText, "thought record");
        assertSchema(record, "thought record");
        if (record.revision !== revision ||
            record.tenant_id !== ref.tenantId ||
            record.workspace_id !== ref.workspaceId ||
            record.thought_id !== ref.thoughtId) {
            throw new LlmthinkServerError("storage_corrupt", "Thought record identity or revision mismatch");
        }
        const events = this.parseJsonLines(eventsText, "events");
        const reflections = this.parseJsonLines(reflectionsText, "reflections");
        const latestAudit = record.latest_audit_id
            ? parseJson(await this.required(join(directory, "audits", `${record.latest_audit_id}.json`), "audit"), "audit")
            : undefined;
        const snapshot = {
            record: {
                id: record.thought_id,
                created_at: record.created_at,
                updated_at: record.updated_at,
                status: record.status,
            },
            draftText: await readOptional(join(directory, "draft.think")),
            finalText: await readOptional(join(directory, "final.think")),
            semanticAuditText: await readOptional(join(directory, "semantic-audit.think")),
            latestAudit,
            history: events,
            reflections,
        };
        if (record.has_draft !== (snapshot.draftText !== undefined) ||
            record.has_final !== (snapshot.finalText !== undefined)) {
            throw new LlmthinkServerError("storage_corrupt", "Thought record file flags do not match revision files");
        }
        return {
            ...snapshot,
            tenantId: ref.tenantId,
            workspaceId: ref.workspaceId,
            revision,
        };
    }
    parseJsonLines(text, subject) {
        return text
            .split(/\r?\n/)
            .filter(Boolean)
            .map((line) => parseJson(line, subject));
    }
    async required(path, subject) {
        const value = await readOptional(path);
        if (value === undefined)
            throw new LlmthinkServerError("storage_corrupt", `Missing ${subject}`);
        return value;
    }
    async idempotentReplay(ref, operation, identity, context) {
        const path = this.idempotencyPath(ref, context.subjectId, operation, identity.idempotencyKey);
        const text = await readOptional(path);
        if (text === undefined) {
            return this.replayFromCurrentRevision(ref, operation, identity, context);
        }
        const record = parseJson(text, "idempotency record");
        assertSchema(record, "idempotency record");
        if (Date.parse(record.expires_at) <= this.clock().getTime()) {
            await rm(path, { force: true });
            return undefined;
        }
        if (record.request_digest !== identity.requestDigest) {
            throw new LlmthinkServerError("idempotency_conflict", "Idempotency key was used for a different request");
        }
        return this.readRevision(ref, record.result_revision);
    }
    async replayFromCurrentRevision(ref, operation, identity, context) {
        const pointerText = await readOptional(this.currentPath(ref));
        if (pointerText === undefined)
            return undefined;
        const pointer = parseJson(pointerText, "CURRENT pointer");
        assertSchema(pointer, "CURRENT pointer");
        const directory = join(this.thoughtPath(ref), "revisions", revisionName(pointer.revision));
        const command = await this.readRevisionCommand(directory);
        if (command.subject_id !== context.subjectId ||
            command.operation !== operation ||
            command.key_digest !== `sha256:${digest(identity.idempotencyKey)}`) {
            return undefined;
        }
        if (command.request_digest !== identity.requestDigest) {
            throw new LlmthinkServerError("idempotency_conflict", "Idempotency key was used for a different request");
        }
        if (Date.parse(command.expires_at) <= this.clock().getTime())
            return undefined;
        return this.readRevision(ref, pointer.revision);
    }
    commandRecord(operation, identity, context) {
        const created = this.clock();
        return {
            schema_version: LLMTHINK_SERVER_FILE_SCHEMA_VERSION,
            subject_id: context.subjectId,
            operation,
            key_digest: `sha256:${digest(identity.idempotencyKey)}`,
            request_digest: identity.requestDigest,
            created_at: created.toISOString(),
            expires_at: new Date(created.getTime() + this.idempotencyRetentionSeconds * 1000).toISOString(),
        };
    }
    async readRevisionCommand(directory) {
        const text = await this.required(join(directory, "command.json"), "command record");
        const command = parseJson(text, "command record");
        assertSchema(command, "command record");
        return command;
    }
    sameCommand(left, right) {
        return (left.subject_id === right.subject_id &&
            left.operation === right.operation &&
            left.key_digest === right.key_digest &&
            left.request_digest === right.request_digest);
    }
    async remember(ref, operation, identity, revision, context) {
        const directory = join(this.thoughtPath(ref), "idempotency");
        await mkdir(directory, { recursive: true });
        const created = this.clock();
        const record = {
            schema_version: LLMTHINK_SERVER_FILE_SCHEMA_VERSION,
            subject_id: context.subjectId,
            operation,
            resource_id: ref.thoughtId,
            key_digest: `sha256:${digest(identity.idempotencyKey)}`,
            request_digest: identity.requestDigest,
            result_revision: revision,
            created_at: created.toISOString(),
            expires_at: new Date(created.getTime() + this.idempotencyRetentionSeconds * 1000).toISOString(),
        };
        const path = this.idempotencyPath(ref, context.subjectId, operation, identity.idempotencyKey);
        await writeFile(path, json(record), { encoding: "utf8", flag: "wx" });
        await syncPath(path);
        await syncPath(directory);
    }
    serialized(ref, action) {
        const key = `${ref.tenantId}/${ref.workspaceId}/${ref.thoughtId}`;
        const previous = this.writes.get(key) ?? Promise.resolve();
        const result = previous.then(action, action);
        const tail = result.then(() => undefined, () => undefined);
        this.writes.set(key, tail);
        tail
            .finally(() => {
            if (this.writes.get(key) === tail)
                this.writes.delete(key);
        })
            .catch(() => undefined);
        return result;
    }
    ref(context, thoughtId) {
        return {
            tenantId: context.tenantId,
            workspaceId: context.workspaceId,
            thoughtId,
        };
    }
    thoughtsPath(context) {
        return join(this.dataRoot, "tenants", context.tenantId, "workspaces", context.workspaceId, "thoughts");
    }
    thoughtPath(ref) {
        return join(this.dataRoot, "tenants", ref.tenantId, "workspaces", ref.workspaceId, "thoughts", ref.thoughtId);
    }
    currentPath(ref) {
        return join(this.thoughtPath(ref), "CURRENT");
    }
    idempotencyPath(ref, subjectId, operation, key) {
        const scope = `${subjectId}\0${operation}\0${key}`;
        return join(this.thoughtPath(ref), "idempotency", `${digest(scope)}.json`);
    }
    assertPageQuery(limit) {
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
            throw new LlmthinkServerError("invalid_argument", "limit must be between 1 and 100");
        }
    }
    encodeCursor(id) {
        return Buffer.from(id, "utf8").toString("base64url");
    }
    decodeCursor(cursor) {
        try {
            const value = Buffer.from(cursor, "base64url").toString("utf8");
            assertHostedId("cursor", value);
            return value;
        }
        catch {
            throw new LlmthinkServerError("invalid_argument", "Invalid cursor");
        }
    }
}
//# sourceMappingURL=file-repository.js.map