export const DOCUMENT_DECLARATION_KINDS = [
    "framework",
    "domain",
    "problem",
    "step",
    "statement",
    "query",
];
export class DuplicateDocumentDeclarationError extends Error {
    first;
    duplicate;
    constructor(first, duplicate) {
        super(`Duplicate declaration ID '${duplicate.id}': ${first.kind} at line ${first.span.line} conflicts with ${duplicate.kind} at line ${duplicate.span.line}`);
        this.first = first;
        this.duplicate = duplicate;
        this.name = "DuplicateDocumentDeclarationError";
    }
}
export class DocumentDeclarationIndex {
    declarations;
    byId;
    constructor(declarations) {
        const byId = new Map();
        for (const declaration of declarations) {
            const previous = byId.get(declaration.id);
            if (previous) {
                throw new DuplicateDocumentDeclarationError(previous, declaration);
            }
            byId.set(declaration.id, declaration);
        }
        this.declarations = [...declarations];
        this.byId = byId;
    }
    has(id) {
        return this.byId.has(id);
    }
    get(id) {
        return this.byId.get(id);
    }
}
export function collectDocumentDeclarations(document) {
    const declarations = [];
    if (document.framework) {
        declarations.push({
            id: document.framework.name,
            kind: "framework",
            span: document.framework.span,
            node: document.framework,
        });
    }
    for (const domain of document.domains) {
        declarations.push({
            id: domain.name,
            kind: "domain",
            span: domain.span,
            node: domain,
        });
    }
    for (const problem of document.problems) {
        declarations.push({
            id: problem.name,
            kind: "problem",
            span: problem.span,
            node: problem,
        });
    }
    for (const step of document.steps) {
        declarations.push({
            id: step.id,
            kind: "step",
            span: step.span,
            node: step,
        });
        declarations.push({
            id: step.statement.id,
            kind: "statement",
            span: step.statement.span,
            node: step.statement,
        });
    }
    for (const query of document.queries) {
        declarations.push({
            id: query.id,
            kind: "query",
            span: query.span,
            node: query,
        });
    }
    return declarations;
}
export function createDocumentDeclarationIndex(document) {
    return new DocumentDeclarationIndex(collectDocumentDeclarations(document));
}
//# sourceMappingURL=declarations.js.map