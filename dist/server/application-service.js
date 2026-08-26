import { auditDslText } from "../analyzer/audit.js";
import { assertCommandIdentity, assertHostedId, assertRevision, assertThoughtRef, LlmthinkServerError, } from "./contracts.js";
import { assertVerifiedRequestContext } from "./security.js";
function requireScope(context, required) {
    assertVerifiedRequestContext(context);
    if (!context.scopes.includes(required)) {
        throw new LlmthinkServerError("forbidden", `Required scope is missing: ${required}`, { requiredScope: required });
    }
}
async function defaultAuditRunner(command) {
    return auditDslText(command.text, command.documentId ?? "document");
}
export class LlmthinkApplicationService {
    repository;
    auditRunner;
    constructor(options) {
        this.repository = options.repository;
        this.auditRunner = options.auditRunner ?? defaultAuditRunner;
    }
    async audit(command, context) {
        requireScope(context, "audit:run");
        if (typeof command.text !== "string" || command.text.length === 0) {
            throw new LlmthinkServerError("invalid_argument", "Audit text is required", { field: "text" });
        }
        try {
            return { persisted: false, report: await this.auditRunner(command) };
        }
        catch (error) {
            if (error instanceof LlmthinkServerError)
                throw error;
            throw new LlmthinkServerError("internal", "Audit execution failed");
        }
    }
    async createThought(command, context) {
        requireScope(context, "thought:write");
        assertHostedId("thoughtId", command.thoughtId);
        assertCommandIdentity(command.identity);
        return this.repositoryCall(() => this.repository.create(command, context));
    }
    async getThought(ref, context) {
        requireScope(context, "thought:read");
        assertThoughtRef(ref, context);
        const thought = await this.repositoryCall(() => this.repository.get(ref, context));
        if (!thought) {
            throw new LlmthinkServerError("not_found", "Thought not found");
        }
        return thought;
    }
    async listThoughts(query, context) {
        requireScope(context, "thought:read");
        return this.repositoryCall(() => this.repository.list(query, context));
    }
    async searchThoughts(query, context) {
        requireScope(context, "thought:read");
        return this.repositoryCall(() => this.repository.search(query, context));
    }
    async saveDraft(command, context) {
        requireScope(context, "thought:write");
        this.assertRevisionCommand(command, context);
        return this.repositoryCall(() => this.repository.saveDraft(command, context));
    }
    async recordAudit(command, context) {
        requireScope(context, "thought:write");
        requireScope(context, "audit:run");
        this.assertRevisionCommand(command, context);
        return this.repositoryCall(() => this.repository.recordAudit(command, context));
    }
    async finalizeThought(command, context) {
        requireScope(context, "thought:finalize");
        this.assertRevisionCommand(command, context);
        if (!command.confirmationToken) {
            throw new LlmthinkServerError("confirmation_required", "Finalization requires confirmation");
        }
        return this.repositoryCall(() => this.repository.finalize(command, context));
    }
    async addReflection(command, context) {
        requireScope(context, "thought:write");
        this.assertRevisionCommand(command, context);
        return this.repositoryCall(() => this.repository.addReflection(command, context));
    }
    async events(ref, context) {
        requireScope(context, "thought:read");
        assertThoughtRef(ref, context);
        return this.repositoryCall(() => this.repository.events(ref, context));
    }
    async deleteThought(command, context) {
        requireScope(context, "thought:write");
        this.assertRevisionCommand(command, context);
        return this.repositoryCall(() => this.repository.delete(command, context));
    }
    assertRevisionCommand(command, context) {
        assertThoughtRef(command.ref, context);
        assertRevision(command.expectedRevision);
        assertCommandIdentity(command.identity);
    }
    async repositoryCall(operation) {
        try {
            return await operation();
        }
        catch (error) {
            if (error instanceof LlmthinkServerError)
                throw error;
            throw new LlmthinkServerError("internal", "Repository operation failed");
        }
    }
}
//# sourceMappingURL=application-service.js.map