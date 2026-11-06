import type { DocumentAst } from "../model/ast.js";
import { type RelationFinding } from "./relations.js";
export declare function auditCausalImpact(document: DocumentAst): RelationFinding[];
