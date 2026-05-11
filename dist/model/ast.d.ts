export type StatementRole = "premise" | "viewpoint" | "partition" | "evidence" | "decision" | "comparison" | "pending";
export type ComparisonRelation = "preferred_over" | "weaker_than" | "incomparable" | "counterexample_to";
export interface SourceSpan {
    line: number;
    column: number;
}
export type TextSyntax = "quoted" | "block";
export interface TextBody {
    syntax: TextSyntax;
    span: SourceSpan;
    lineCount: number;
}
export type AnnotationKind = "explanation" | "rationale" | "status" | "caveat" | "todo" | "orphan_future" | "orphan_reference";
export interface Annotation {
    kind: AnnotationKind;
    text: string;
    body: TextBody;
    span: SourceSpan;
}
export interface FrameworkRule {
    kind: "requires" | "forbids" | "warns";
    value: string;
    span: SourceSpan;
}
export interface FrameworkDecl {
    name: string;
    rules: FrameworkRule[];
    span: SourceSpan;
}
export interface DomainDecl {
    name: string;
    description: string;
    descriptionBody: TextBody;
    span: SourceSpan;
}
export interface ProblemDecl {
    name: string;
    text: string;
    textBody: TextBody;
    annotations: Annotation[];
    span: SourceSpan;
}
export interface PremiseStatement {
    role: "premise";
    id: string;
    text: string;
    textBody: TextBody;
    annotations: Annotation[];
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
    textBody: TextBody;
    annotations: Annotation[];
    span: SourceSpan;
}
export interface DecisionStatement {
    role: "decision";
    id: string;
    basedOn: string[];
    text: string;
    textBody: TextBody;
    annotations: Annotation[];
    span: SourceSpan;
}
export interface ComparisonStatement {
    role: "comparison";
    id: string;
    problemId: string;
    viewpointId: string;
    relation: ComparisonRelation;
    leftDecisionId: string;
    rightDecisionId: string;
    text: string;
    textBody: TextBody;
    annotations: Annotation[];
    span: SourceSpan;
}
export interface PendingStatement {
    role: "pending";
    id: string;
    text: string;
    textBody: TextBody;
    annotations: Annotation[];
    span: SourceSpan;
}
export type StepStatement = PremiseStatement | ViewpointStatement | PartitionStatement | EvidenceStatement | DecisionStatement | ComparisonStatement | PendingStatement;
export interface StepSyntax {
    step: "explicit" | "implicit";
    stepId: "explicit" | "synthetic";
}
export interface StepDecl {
    id: string;
    statement: StepStatement;
    span: SourceSpan;
    syntax: StepSyntax;
}
export interface QueryDecl {
    id: string;
    expression: string;
    span: SourceSpan;
    expressionSpan: SourceSpan;
}
export interface DocumentAst {
    framework?: FrameworkDecl;
    domains: DomainDecl[];
    problems: ProblemDecl[];
    steps: StepDecl[];
    queries: QueryDecl[];
}
