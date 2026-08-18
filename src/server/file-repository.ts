import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import type { AuditReport } from "../model/diagnostics.js";
import type {
  ThoughtEvent,
  ThoughtReflection,
  ThoughtSnapshot,
} from "../thought/store.js";
import {
  assertCommandIdentity,
  assertHostedId,
  assertIdempotencyRetention,
  assertRevision,
  assertThoughtRef,
  DEFAULT_IDEMPOTENCY_RETENTION_SECONDS,
  LLMTHINK_SERVER_FILE_SCHEMA_VERSION,
  LlmthinkServerError,
  type AddReflectionCommand,
  type CommandIdentity,
  type CreateThoughtCommand,
  type NewThoughtRevision,
  type RecordAuditCommand,
  type RequestContext,
  type SaveDraftCommand,
  type ServerThoughtCurrentPointer,
  type ServerThoughtFileRecord,
  type ServerThoughtSnapshot,
  type StoredIdempotencyRecord,
  type ThoughtListQuery,
  type ThoughtPage,
  type ThoughtRef,
  type ThoughtRepository,
  type ThoughtSearchQuery,
  type FinalizeThoughtCommand,
} from "./contracts.js";

export interface ServerFileThoughtRepositoryOptions {
  readonly dataRoot: string;
  readonly idempotencyRetentionSeconds?: number;
  readonly clock?: () => Date;
}

interface RevisionFiles {
  readonly record: ServerThoughtFileRecord;
  readonly draftText?: string;
  readonly finalText?: string;
  readonly semanticAuditText?: string;
  readonly latestAudit?: AuditReport;
  readonly events: ThoughtEvent[];
  readonly reflections: ThoughtReflection[];
}

interface RevisionCommandRecord {
  readonly schema_version: typeof LLMTHINK_SERVER_FILE_SCHEMA_VERSION;
  readonly subject_id: string;
  readonly operation: string;
  readonly key_digest: `sha256:${string}`;
  readonly request_digest: `sha256:${string}`;
  readonly created_at: string;
  readonly expires_at: string;
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function revisionName(revision: number): string {
  return revision.toString().padStart(16, "0");
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function syncPath(path: string): Promise<void> {
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function parseJson<T>(text: string, subject: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new LlmthinkServerError("storage_corrupt", `Invalid ${subject}`);
  }
}

function assertSchema(
  value: { schema_version?: unknown },
  subject: string,
): void {
  if (value.schema_version !== LLMTHINK_SERVER_FILE_SCHEMA_VERSION) {
    throw new LlmthinkServerError(
      "unsupported_schema_version",
      `Unsupported ${subject} schema version`,
    );
  }
}

function assertContext(context: RequestContext): void {
  assertHostedId("subjectId", context.subjectId);
  assertHostedId("tenantId", context.tenantId);
  assertHostedId("workspaceId", context.workspaceId);
  assertHostedId("requestId", context.requestId);
}

export class ServerFileThoughtRepository implements ThoughtRepository {
  readonly dataRoot: string;
  readonly idempotencyRetentionSeconds: number;
  readonly clock: () => Date;
  readonly writes = new Map<string, Promise<void>>();

  constructor(options: ServerFileThoughtRepositoryOptions) {
    if (!options.dataRoot || !isAbsolute(options.dataRoot)) {
      throw new LlmthinkServerError(
        "invalid_argument",
        "dataRoot must be an explicit absolute path",
      );
    }
    this.dataRoot = resolve(options.dataRoot);
    this.idempotencyRetentionSeconds =
      options.idempotencyRetentionSeconds ??
      DEFAULT_IDEMPOTENCY_RETENTION_SECONDS;
    assertIdempotencyRetention(this.idempotencyRetentionSeconds);
    this.clock = options.clock ?? (() => new Date());
  }

  async create(
    command: CreateThoughtCommand,
    context: RequestContext,
  ): Promise<ServerThoughtSnapshot> {
    assertContext(context);
    assertHostedId("thoughtId", command.thoughtId);
    assertCommandIdentity(command.identity);
    const ref = this.ref(context, command.thoughtId);
    return this.serialized(ref, async () => {
      const replay = await this.idempotentReplay(
        ref,
        "create",
        command.identity,
        context,
      );
      if (replay) return replay;
      if (await exists(this.currentPath(ref))) {
        throw new LlmthinkServerError(
          "revision_conflict",
          "Thought already exists",
        );
      }
      const at = this.clock().toISOString();
      const revision: NewThoughtRevision = {
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
      const result = await this.commit(
        ref,
        revision,
        this.commandRecord("create", command.identity, context),
      );
      await this.remember(
        ref,
        "create",
        command.identity,
        result.revision,
        context,
      );
      return result;
    });
  }

  async get(
    ref: ThoughtRef,
    context: RequestContext,
  ): Promise<ServerThoughtSnapshot | null> {
    assertContext(context);
    assertThoughtRef(ref, context);
    if (!(await exists(this.currentPath(ref)))) return null;
    return this.readCurrent(ref);
  }

  async list(
    query: ThoughtListQuery,
    context: RequestContext,
  ): Promise<ThoughtPage> {
    assertContext(context);
    this.assertPageQuery(query.limit);
    const thoughtsDir = this.thoughtsPath(context);
    let ids: string[] = [];
    try {
      ids = (await readdir(thoughtsDir, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .map((entry) => entry.name)
        .sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const after = query.cursor ? this.decodeCursor(query.cursor) : undefined;
    const items: ServerThoughtSnapshot[] = [];
    let nextCursor: string | undefined;
    for (const id of ids) {
      if (after && id <= after) continue;
      const snapshot = await this.get(this.ref(context, id), context);
      if (
        !snapshot ||
        (query.status && snapshot.record.status !== query.status)
      )
        continue;
      if (items.length === query.limit) {
        nextCursor = this.encodeCursor(items.at(-1)!.record.id);
        break;
      }
      items.push(snapshot);
    }
    return { items, ...(nextCursor ? { nextCursor } : {}) };
  }

  async search(
    query: ThoughtSearchQuery,
    context: RequestContext,
  ): Promise<ThoughtPage> {
    if (!query.query.trim()) {
      throw new LlmthinkServerError(
        "invalid_argument",
        "query must not be empty",
      );
    }
    const page = await this.list(
      { cursor: query.cursor, limit: query.limit },
      context,
    );
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

  async saveDraft(
    command: SaveDraftCommand,
    context: RequestContext,
  ): Promise<ServerThoughtSnapshot> {
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

  async recordAudit(
    command: RecordAuditCommand,
    context: RequestContext,
  ): Promise<ServerThoughtSnapshot> {
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

  async finalize(
    command: FinalizeThoughtCommand,
    context: RequestContext,
  ): Promise<ServerThoughtSnapshot> {
    if (!command.confirmationToken) {
      throw new LlmthinkServerError(
        "confirmation_required",
        "Finalization requires confirmation",
      );
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

  async addReflection(
    command: AddReflectionCommand,
    context: RequestContext,
  ): Promise<ServerThoughtSnapshot> {
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

  async events(
    ref: ThoughtRef,
    context: RequestContext,
  ): Promise<readonly ThoughtEvent[]> {
    const snapshot = await this.get(ref, context);
    if (!snapshot)
      throw new LlmthinkServerError("not_found", "Thought not found");
    return snapshot.history;
  }

  private async update<
    T extends {
      ref: ThoughtRef;
      expectedRevision: number;
      identity: CommandIdentity;
    },
  >(
    operation: string,
    command: T,
    context: RequestContext,
    mutate: (current: RevisionFiles, at: string) => RevisionFiles,
  ): Promise<ServerThoughtSnapshot> {
    assertContext(context);
    assertThoughtRef(command.ref, context);
    assertRevision(command.expectedRevision);
    assertCommandIdentity(command.identity);
    return this.serialized(command.ref, async () => {
      const replay = await this.idempotentReplay(
        command.ref,
        operation,
        command.identity,
        context,
      );
      if (replay) return replay;
      const current = await this.readFiles(command.ref);
      if (current.record.revision !== command.expectedRevision) {
        throw new LlmthinkServerError(
          "revision_conflict",
          "Expected revision does not match",
          {
            expectedRevision: command.expectedRevision,
            actualRevision: current.record.revision,
          },
        );
      }
      const at = this.clock().toISOString();
      const next = mutate(current, at);
      const revision: NewThoughtRevision = {
        record: { ...next.record, revision: current.record.revision + 1 },
        draftText: next.draftText,
        finalText: next.finalText,
        semanticAuditText: next.semanticAuditText,
        audit: next.latestAudit,
        events: next.events,
        reflections: next.reflections,
      };
      const result = await this.commit(
        command.ref,
        revision,
        this.commandRecord(operation, command.identity, context),
      );
      await this.remember(
        command.ref,
        operation,
        command.identity,
        result.revision,
        context,
      );
      return result;
    });
  }

  private async commit(
    ref: ThoughtRef,
    revision: NewThoughtRevision,
    command: RevisionCommandRecord,
  ): Promise<ServerThoughtSnapshot> {
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
          throw new LlmthinkServerError(
            "storage_corrupt",
            "Next revision already exists without matching recovery evidence",
          );
        }
        await rm(target, { recursive: true });
      }
      await rename(temporary, target);
      await syncPath(revisions);
      const pointer: ServerThoughtCurrentPointer = {
        schema_version: LLMTHINK_SERVER_FILE_SCHEMA_VERSION,
        revision: revision.record.revision,
      };
      const pointerTemp = join(thought, `.CURRENT-${randomUUID()}`);
      await writeFile(pointerTemp, json(pointer), "utf8");
      await syncPath(pointerTemp);
      await rename(pointerTemp, this.currentPath(ref));
      await syncPath(thought);
    } catch (error) {
      await rm(temporary, { recursive: true, force: true });
      if (error instanceof LlmthinkServerError) throw error;
      throw new LlmthinkServerError(
        "internal",
        "Could not commit thought revision",
      );
    }
    return this.readRevision(ref, revision.record.revision);
  }

  private async writeRevisionFiles(
    directory: string,
    revision: NewThoughtRevision,
    command: RevisionCommandRecord,
  ): Promise<void> {
    const writes: Array<[string, string]> = [
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
      const auditId =
        revision.record.latest_audit_id ??
        digest(JSON.stringify(revision.audit));
      writes.push([join("audits", `${auditId}.json`), json(revision.audit)]);
    }
    for (const [relative, content] of writes) {
      const path = join(directory, relative);
      await writeFile(path, content, "utf8");
      await syncPath(path);
    }
  }

  private async readCurrent(ref: ThoughtRef): Promise<ServerThoughtSnapshot> {
    const text = await readOptional(this.currentPath(ref));
    if (text === undefined)
      throw new LlmthinkServerError("not_found", "Thought not found");
    const pointer = parseJson<ServerThoughtCurrentPointer>(
      text,
      "CURRENT pointer",
    );
    assertSchema(pointer, "CURRENT pointer");
    if (!Number.isSafeInteger(pointer.revision) || pointer.revision < 1) {
      throw new LlmthinkServerError(
        "storage_corrupt",
        "Invalid CURRENT revision",
      );
    }
    return this.readRevision(ref, pointer.revision);
  }

  private async readFiles(ref: ThoughtRef): Promise<RevisionFiles> {
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

  private async readRevision(
    ref: ThoughtRef,
    revision: number,
  ): Promise<ServerThoughtSnapshot> {
    const directory = join(
      this.thoughtPath(ref),
      "revisions",
      revisionName(revision),
    );
    const recordText = await readOptional(join(directory, "record.json"));
    const eventsText = await readOptional(join(directory, "events.jsonl"));
    const reflectionsText = await readOptional(
      join(directory, "reflections.jsonl"),
    );
    if (
      recordText === undefined ||
      eventsText === undefined ||
      reflectionsText === undefined
    ) {
      throw new LlmthinkServerError(
        "storage_corrupt",
        "CURRENT points to an incomplete revision",
      );
    }
    const record = parseJson<ServerThoughtFileRecord>(
      recordText,
      "thought record",
    );
    assertSchema(record, "thought record");
    if (
      record.revision !== revision ||
      record.tenant_id !== ref.tenantId ||
      record.workspace_id !== ref.workspaceId ||
      record.thought_id !== ref.thoughtId
    ) {
      throw new LlmthinkServerError(
        "storage_corrupt",
        "Thought record identity or revision mismatch",
      );
    }
    const events = this.parseJsonLines<ThoughtEvent>(eventsText, "events");
    const reflections = this.parseJsonLines<ThoughtReflection>(
      reflectionsText,
      "reflections",
    );
    const latestAudit = record.latest_audit_id
      ? parseJson<AuditReport>(
          await this.required(
            join(directory, "audits", `${record.latest_audit_id}.json`),
            "audit",
          ),
          "audit",
        )
      : undefined;
    const snapshot: ThoughtSnapshot = {
      record: {
        id: record.thought_id,
        created_at: record.created_at,
        updated_at: record.updated_at,
        status: record.status,
      },
      draftText: await readOptional(join(directory, "draft.think")),
      finalText: await readOptional(join(directory, "final.think")),
      semanticAuditText: await readOptional(
        join(directory, "semantic-audit.think"),
      ),
      latestAudit,
      history: events,
      reflections,
    };
    if (
      record.has_draft !== (snapshot.draftText !== undefined) ||
      record.has_final !== (snapshot.finalText !== undefined)
    ) {
      throw new LlmthinkServerError(
        "storage_corrupt",
        "Thought record file flags do not match revision files",
      );
    }
    return {
      ...snapshot,
      tenantId: ref.tenantId,
      workspaceId: ref.workspaceId,
      revision,
    };
  }

  private parseJsonLines<T>(text: string, subject: string): T[] {
    return text
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => parseJson<T>(line, subject));
  }

  private async required(path: string, subject: string): Promise<string> {
    const value = await readOptional(path);
    if (value === undefined)
      throw new LlmthinkServerError("storage_corrupt", `Missing ${subject}`);
    return value;
  }

  private async idempotentReplay(
    ref: ThoughtRef,
    operation: string,
    identity: CommandIdentity,
    context: RequestContext,
  ): Promise<ServerThoughtSnapshot | undefined> {
    const path = this.idempotencyPath(
      ref,
      context.subjectId,
      operation,
      identity.idempotencyKey,
    );
    const text = await readOptional(path);
    if (text === undefined) {
      return this.replayFromCurrentRevision(ref, operation, identity, context);
    }
    const record = parseJson<StoredIdempotencyRecord>(
      text,
      "idempotency record",
    );
    assertSchema(record, "idempotency record");
    if (Date.parse(record.expires_at) <= this.clock().getTime()) {
      await rm(path, { force: true });
      return undefined;
    }
    if (record.request_digest !== identity.requestDigest) {
      throw new LlmthinkServerError(
        "idempotency_conflict",
        "Idempotency key was used for a different request",
      );
    }
    return this.readRevision(ref, record.result_revision);
  }

  private async replayFromCurrentRevision(
    ref: ThoughtRef,
    operation: string,
    identity: CommandIdentity,
    context: RequestContext,
  ): Promise<ServerThoughtSnapshot | undefined> {
    const pointerText = await readOptional(this.currentPath(ref));
    if (pointerText === undefined) return undefined;
    const pointer = parseJson<ServerThoughtCurrentPointer>(
      pointerText,
      "CURRENT pointer",
    );
    assertSchema(pointer, "CURRENT pointer");
    const directory = join(
      this.thoughtPath(ref),
      "revisions",
      revisionName(pointer.revision),
    );
    const command = await this.readRevisionCommand(directory);
    if (
      command.subject_id !== context.subjectId ||
      command.operation !== operation ||
      command.key_digest !== `sha256:${digest(identity.idempotencyKey)}`
    ) {
      return undefined;
    }
    if (command.request_digest !== identity.requestDigest) {
      throw new LlmthinkServerError(
        "idempotency_conflict",
        "Idempotency key was used for a different request",
      );
    }
    if (Date.parse(command.expires_at) <= this.clock().getTime())
      return undefined;
    return this.readRevision(ref, pointer.revision);
  }

  private commandRecord(
    operation: string,
    identity: CommandIdentity,
    context: RequestContext,
  ): RevisionCommandRecord {
    const created = this.clock();
    return {
      schema_version: LLMTHINK_SERVER_FILE_SCHEMA_VERSION,
      subject_id: context.subjectId,
      operation,
      key_digest: `sha256:${digest(identity.idempotencyKey)}`,
      request_digest: identity.requestDigest,
      created_at: created.toISOString(),
      expires_at: new Date(
        created.getTime() + this.idempotencyRetentionSeconds * 1000,
      ).toISOString(),
    };
  }

  private async readRevisionCommand(
    directory: string,
  ): Promise<RevisionCommandRecord> {
    const text = await this.required(
      join(directory, "command.json"),
      "command record",
    );
    const command = parseJson<RevisionCommandRecord>(text, "command record");
    assertSchema(command, "command record");
    return command;
  }

  private sameCommand(
    left: RevisionCommandRecord,
    right: RevisionCommandRecord,
  ): boolean {
    return (
      left.subject_id === right.subject_id &&
      left.operation === right.operation &&
      left.key_digest === right.key_digest &&
      left.request_digest === right.request_digest
    );
  }

  private async remember(
    ref: ThoughtRef,
    operation: string,
    identity: CommandIdentity,
    revision: number,
    context: RequestContext,
  ): Promise<void> {
    const directory = join(this.thoughtPath(ref), "idempotency");
    await mkdir(directory, { recursive: true });
    const created = this.clock();
    const record: StoredIdempotencyRecord = {
      schema_version: LLMTHINK_SERVER_FILE_SCHEMA_VERSION,
      subject_id: context.subjectId,
      operation,
      resource_id: ref.thoughtId,
      key_digest: `sha256:${digest(identity.idempotencyKey)}`,
      request_digest: identity.requestDigest,
      result_revision: revision,
      created_at: created.toISOString(),
      expires_at: new Date(
        created.getTime() + this.idempotencyRetentionSeconds * 1000,
      ).toISOString(),
    };
    const path = this.idempotencyPath(
      ref,
      context.subjectId,
      operation,
      identity.idempotencyKey,
    );
    await writeFile(path, json(record), { encoding: "utf8", flag: "wx" });
    await syncPath(path);
    await syncPath(directory);
  }

  private serialized<T>(ref: ThoughtRef, action: () => Promise<T>): Promise<T> {
    const key = `${ref.tenantId}/${ref.workspaceId}/${ref.thoughtId}`;
    const previous = this.writes.get(key) ?? Promise.resolve();
    const result = previous.then(action, action);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.writes.set(key, tail);
    tail
      .finally(() => {
        if (this.writes.get(key) === tail) this.writes.delete(key);
      })
      .catch(() => undefined);
    return result;
  }

  private ref(context: RequestContext, thoughtId: string): ThoughtRef {
    return {
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      thoughtId,
    };
  }

  private thoughtsPath(context: RequestContext): string {
    return join(
      this.dataRoot,
      "tenants",
      context.tenantId,
      "workspaces",
      context.workspaceId,
      "thoughts",
    );
  }

  private thoughtPath(ref: ThoughtRef): string {
    return join(
      this.dataRoot,
      "tenants",
      ref.tenantId,
      "workspaces",
      ref.workspaceId,
      "thoughts",
      ref.thoughtId,
    );
  }

  private currentPath(ref: ThoughtRef): string {
    return join(this.thoughtPath(ref), "CURRENT");
  }

  private idempotencyPath(
    ref: ThoughtRef,
    subjectId: string,
    operation: string,
    key: string,
  ): string {
    const scope = `${subjectId}\0${operation}\0${key}`;
    return join(this.thoughtPath(ref), "idempotency", `${digest(scope)}.json`);
  }

  private assertPageQuery(limit: number): void {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new LlmthinkServerError(
        "invalid_argument",
        "limit must be between 1 and 100",
      );
    }
  }

  private encodeCursor(id: string): string {
    return Buffer.from(id, "utf8").toString("base64url");
  }

  private decodeCursor(cursor: string): string {
    try {
      const value = Buffer.from(cursor, "base64url").toString("utf8");
      assertHostedId("cursor", value);
      return value;
    } catch {
      throw new LlmthinkServerError("invalid_argument", "Invalid cursor");
    }
  }
}
