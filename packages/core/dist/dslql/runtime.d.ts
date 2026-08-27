import type { DocumentAst } from "../model/ast.js";
import { type DslqlRuntime, type DslqlValue } from "./evaluator.js";
export interface DocumentDslqlRuntimeOptions {
    audit?: DslqlValue;
    thought?: DslqlValue;
    search?: DslqlValue[];
}
export declare function createDocumentDslqlRuntime(documentAst: DocumentAst, options?: DocumentDslqlRuntimeOptions): DslqlRuntime;
export declare function documentAstToDslqlValue(document: DocumentAst): DslqlValue;
