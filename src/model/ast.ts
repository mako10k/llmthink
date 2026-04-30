export type StatementRole =
  | "premise"
  | "viewpoint"
  | "partition"
  | "evidence"
  | "decision"
  | "pending";

export interface SourceSpan {
  line: number;
  column: number;
}

export interface FrameworkRule {
  kind: "requires" | "forbids" | "warns";
  value: string;
}

export interface FrameworkDecl {
  name: string;
  rules: FrameworkRule[];
  span: SourceSpan;
}

export interface DomainDecl {
  name: string;
  description: string;
  span: SourceSpan;
}

export interface ProblemDecl {
  name: string;
  text: string;
  span: SourceSpan;
}

export interface PremiseStatement {
  role: "premise";
  id: string;
  text: string;
  span: SourceSpan;
}

export interface ViewpointStatement {
  role: "viewpoint";
  id: string;
  axis: string;
  span: SourceSpan;
}

export interface PartitionMember {
  name: string;
  predicate: string;
}

export interface PartitionStatement {
  role: "partition";
  id: string;
  domainName: string;
  axis: string;
  members: PartitionMember[];
  span: SourceSpan;
}

export interface EvidenceStatement {
  role: "evidence";
  id: string;
  text: string;
  span: SourceSpan;
}

export interface DecisionStatement {
  role: "decision";
  id: string;
  basedOn: string[];
  text: string;
  span: SourceSpan;
}

export interface PendingStatement {
  role: "pending";
  id: string;
  text: string;
  span: SourceSpan;
}

export type StepStatement =
  | PremiseStatement
  | ViewpointStatement
  | PartitionStatement
  | EvidenceStatement
  | DecisionStatement
  | PendingStatement;

export interface StepDecl {
  id: string;
  statement: StepStatement;
  span: SourceSpan;
}

export interface QueryDecl {
  id: string;
  expression: string;
  span: SourceSpan;
}

export interface DocumentAst {
  framework?: FrameworkDecl;
  domains: DomainDecl[];
  problems: ProblemDecl[];
  steps: StepDecl[];
  queries: QueryDecl[];
}
