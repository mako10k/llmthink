import type { EvidenceResource, EvidenceResourceLocator, EvidenceResourceMetadataValue, SourceSpan } from "./ast.js";
export declare class EvidenceResourceValidationError extends Error {
    readonly span: SourceSpan;
    readonly endColumn: number;
    constructor(message: string, span: SourceSpan, endColumn?: number);
}
export interface EvidenceResourceInput {
    locator: EvidenceResourceLocator;
    digest?: EvidenceResourceMetadataValue;
    mime?: EvidenceResourceMetadataValue;
    label?: EvidenceResourceMetadataValue;
    span: SourceSpan;
}
export declare function validateEvidenceResource(resource: EvidenceResource): void;
export declare function createEvidenceResource(input: EvidenceResourceInput): EvidenceResource;
