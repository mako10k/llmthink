import type { DocumentAst, DomainDecl, FrameworkDecl, ProblemDecl, QueryDecl, SourceSpan, StepDecl, StepStatement } from "./ast.js";
export declare const DOCUMENT_DECLARATION_KINDS: readonly ["framework", "domain", "problem", "step", "statement", "query"];
export type DocumentDeclarationKind = (typeof DOCUMENT_DECLARATION_KINDS)[number];
export type DocumentDeclarationNode = FrameworkDecl | DomainDecl | ProblemDecl | StepDecl | StepStatement | QueryDecl;
export interface DocumentDeclaration {
    id: string;
    kind: DocumentDeclarationKind;
    span: SourceSpan;
    node: DocumentDeclarationNode;
}
export declare class DuplicateDocumentDeclarationError extends Error {
    readonly first: DocumentDeclaration;
    readonly duplicate: DocumentDeclaration;
    constructor(first: DocumentDeclaration, duplicate: DocumentDeclaration);
}
export declare class DocumentDeclarationIndex {
    readonly declarations: readonly DocumentDeclaration[];
    readonly byId: ReadonlyMap<string, DocumentDeclaration>;
    constructor(declarations: readonly DocumentDeclaration[]);
    has(id: string): boolean;
    get(id: string): DocumentDeclaration | undefined;
}
export declare function collectDocumentDeclarations(document: DocumentAst): DocumentDeclaration[];
export declare function createDocumentDeclarationIndex(document: DocumentAst): DocumentDeclarationIndex;
