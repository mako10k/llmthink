import { auditDslText, type AuditReport } from "@llmthink/core";
import {
  assertCommandIdentity,
  assertHostedId,
  assertRevision,
  assertThoughtRef,
  LlmthinkServerError,
  type AddReflectionCommand,
  type AuditTextCommand,
  type CreateThoughtCommand,
  type DeleteThoughtCommand,
  type FinalizeThoughtCommand,
  type LlmthinkServerScope,
  type PureAuditResult,
  type RecordAuditCommand,
  type RequestContext,
  type SaveDraftCommand,
  type ServerThoughtSnapshot,
  type ThoughtListQuery,
  type ThoughtPage,
  type ThoughtDeletionReceipt,
  type ThoughtRef,
  type ThoughtRepository,
  type ThoughtSearchQuery,
  type ThoughtEvent,
} from "./contracts.js";
import { assertVerifiedRequestContext } from "./security.js";

export type LlmthinkAuditRunner = (
  command: AuditTextCommand,
) => Promise<AuditReport>;

export interface LlmthinkApplicationServiceOptions {
  readonly repository: ThoughtRepository;
  readonly auditRunner?: LlmthinkAuditRunner;
}

function requireScope(
  context: RequestContext,
  required: LlmthinkServerScope,
): void {
  assertVerifiedRequestContext(context);
  if (!context.scopes.includes(required)) {
    throw new LlmthinkServerError(
      "forbidden",
      `Required scope is missing: ${required}`,
      { requiredScope: required },
    );
  }
}

async function defaultAuditRunner(
  command: AuditTextCommand,
): Promise<AuditReport> {
  return auditDslText(command.text, command.documentId ?? "document");
}

export class LlmthinkApplicationService {
  readonly repository: ThoughtRepository;
  readonly auditRunner: LlmthinkAuditRunner;

  constructor(options: LlmthinkApplicationServiceOptions) {
    this.repository = options.repository;
    this.auditRunner = options.auditRunner ?? defaultAuditRunner;
  }

  async audit(
    command: AuditTextCommand,
    context: RequestContext,
  ): Promise<PureAuditResult> {
    requireScope(context, "audit:run");
    if (typeof command.text !== "string" || command.text.length === 0) {
      throw new LlmthinkServerError(
        "invalid_argument",
        "Audit text is required",
        { field: "text" },
      );
    }
    try {
      return { persisted: false, report: await this.auditRunner(command) };
    } catch (error) {
      if (error instanceof LlmthinkServerError) throw error;
      throw new LlmthinkServerError("internal", "Audit execution failed");
    }
  }

  async createThought(
    command: CreateThoughtCommand,
    context: RequestContext,
  ): Promise<ServerThoughtSnapshot> {
    requireScope(context, "thought:write");
    assertHostedId("thoughtId", command.thoughtId);
    assertCommandIdentity(command.identity);
    return this.repositoryCall(() => this.repository.create(command, context));
  }

  async getThought(
    ref: ThoughtRef,
    context: RequestContext,
  ): Promise<ServerThoughtSnapshot> {
    requireScope(context, "thought:read");
    assertThoughtRef(ref, context);
    const thought = await this.repositoryCall(() =>
      this.repository.get(ref, context),
    );
    if (!thought) {
      throw new LlmthinkServerError("not_found", "Thought not found");
    }
    return thought;
  }

  async listThoughts(
    query: ThoughtListQuery,
    context: RequestContext,
  ): Promise<ThoughtPage> {
    requireScope(context, "thought:read");
    return this.repositoryCall(() => this.repository.list(query, context));
  }

  async searchThoughts(
    query: ThoughtSearchQuery,
    context: RequestContext,
  ): Promise<ThoughtPage> {
    requireScope(context, "thought:read");
    return this.repositoryCall(() => this.repository.search(query, context));
  }

  async saveDraft(
    command: SaveDraftCommand,
    context: RequestContext,
  ): Promise<ServerThoughtSnapshot> {
    requireScope(context, "thought:write");
    this.assertRevisionCommand(command, context);
    return this.repositoryCall(() =>
      this.repository.saveDraft(command, context),
    );
  }

  async recordAudit(
    command: RecordAuditCommand,
    context: RequestContext,
  ): Promise<ServerThoughtSnapshot> {
    requireScope(context, "thought:write");
    requireScope(context, "audit:run");
    this.assertRevisionCommand(command, context);
    return this.repositoryCall(() =>
      this.repository.recordAudit(command, context),
    );
  }

  async finalizeThought(
    command: FinalizeThoughtCommand,
    context: RequestContext,
  ): Promise<ServerThoughtSnapshot> {
    requireScope(context, "thought:finalize");
    this.assertRevisionCommand(command, context);
    if (!command.confirmationToken) {
      throw new LlmthinkServerError(
        "confirmation_required",
        "Finalization requires confirmation",
      );
    }
    return this.repositoryCall(() =>
      this.repository.finalize(command, context),
    );
  }

  async addReflection(
    command: AddReflectionCommand,
    context: RequestContext,
  ): Promise<ServerThoughtSnapshot> {
    requireScope(context, "thought:write");
    this.assertRevisionCommand(command, context);
    return this.repositoryCall(() =>
      this.repository.addReflection(command, context),
    );
  }

  async events(
    ref: ThoughtRef,
    context: RequestContext,
  ): Promise<readonly ThoughtEvent[]> {
    requireScope(context, "thought:read");
    assertThoughtRef(ref, context);
    return this.repositoryCall(() => this.repository.events(ref, context));
  }

  async deleteThought(
    command: DeleteThoughtCommand,
    context: RequestContext,
  ): Promise<ThoughtDeletionReceipt> {
    requireScope(context, "thought:write");
    this.assertRevisionCommand(command, context);
    return this.repositoryCall(() => this.repository.delete(command, context));
  }

  private assertRevisionCommand(
    command: {
      readonly ref: ThoughtRef;
      readonly expectedRevision: number;
      readonly identity: {
        readonly idempotencyKey: string;
        readonly requestDigest: `sha256:${string}`;
      };
    },
    context: RequestContext,
  ): void {
    assertThoughtRef(command.ref, context);
    assertRevision(command.expectedRevision);
    assertCommandIdentity(command.identity);
  }

  private async repositoryCall<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof LlmthinkServerError) throw error;
      throw new LlmthinkServerError("internal", "Repository operation failed");
    }
  }
}
