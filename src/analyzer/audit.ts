import { readFileSync } from "node:fs";
import { basename } from "node:path";

import type {
  DecisionStatement,
  DocumentAst,
  PartitionStatement,
  StepStatement,
} from "../model/ast.js";
import type {
  AuditIssue,
  AuditReference,
  AuditReport,
  AuditSeverity,
  QueryResult,
} from "../model/diagnostics.js";
import {
  createDslGuidanceReport,
  createParseErrorReport,
  isDslHelpRequest,
} from "../dsl/guidance.js";
import { ParseError, parseDocument } from "../parser/parser.js";
import {
  cosineSimilarity,
  embedTexts,
  type EmbeddingRequestOptions,
} from "../semantic/embeddings.js";

const ENGINE_VERSION = "0.1.0";

interface AuditOptions {
  embeddings?: EmbeddingRequestOptions;
}

function issueId(index: number): string {
  return `ISSUE-${String(index).padStart(3, "0")}`;
}

function statementReference(
  statement: StepStatement,
  stepId?: string,
): AuditReference {
  return {
    ref_id: statement.id,
    role: statement.role,
    step_id: stepId,
  };
}

function summarize(results: AuditIssue[]): AuditReport["summary"] {
  const counts: Record<AuditSeverity, number> = {
    fatal: 0,
    error: 0,
    warning: 0,
    info: 0,
    hint: 0,
  };
  for (const result of results) {
    counts[result.severity] += 1;
  }
  return {
    fatal_count: counts.fatal,
    error_count: counts.error,
    warning_count: counts.warning,
    info_count: counts.info,
    hint_count: counts.hint,
  };
}

function createIssue(
  issues: AuditIssue[],
  partial: Omit<AuditIssue, "issue_id">,
): void {
  issues.push({ issue_id: issueId(issues.length + 1), ...partial });
}

function collectDeclaredIds(document: DocumentAst): Set<string> {
  const ids = new Set<string>();
  for (const problem of document.problems) ids.add(problem.name);
  for (const step of document.steps) ids.add(step.statement.id);
  return ids;
}

function findDecisions(
  document: DocumentAst,
): Array<{ stepId: string; statement: DecisionStatement }> {
  const decisions: Array<{ stepId: string; statement: DecisionStatement }> = [];
  for (const step of document.steps) {
    if (step.statement.role === "decision") {
      decisions.push({ stepId: step.id, statement: step.statement });
    }
  }
  return decisions;
}

function findPending(
  document: DocumentAst,
): Array<{ stepId: string; statement: StepStatement }> {
  return document.steps
    .filter((step) => step.statement.role === "pending")
    .map((step) => ({ stepId: step.id, statement: step.statement }));
}

function extractRelatedDecisionProblemId(
  queryExpression: string,
): string | undefined {
  const normalized = queryExpression.trim();
  const prefix = "related_decisions(";
  if (!normalized.startsWith(prefix) || !normalized.endsWith(")")) {
    return undefined;
  }
  const problemId = normalized.slice(prefix.length, -1).trim();
  return /^[A-Za-z][A-Za-z0-9_-]*$/.test(problemId) ? problemId : undefined;
}

function tokenizeFrameworkRequirement(value: string): string[] {
  return value
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && token !== "and" && token !== "or");
}

function collectAvailableRoles(document: DocumentAst): Set<string> {
  const stepRoles = document.steps.map((step) => step.statement.role);
  const topLevelRoles = [
    ...(document.problems.length > 0 ? ["problem"] : []),
    ...(document.framework ? ["framework"] : []),
  ];
  return new Set<string>([...stepRoles, ...topLevelRoles]);
}

function auditFrameworkRequirements(
  issues: AuditIssue[],
  document: DocumentAst,
): void {
  if (!document.framework) {
    return;
  }

  const availableRoles = collectAvailableRoles(document);
  for (const rule of document.framework.rules) {
    if (rule.kind !== "requires") {
      continue;
    }

    const requiredTokens = tokenizeFrameworkRequirement(rule.value);
    const satisfied = requiredTokens.some((token) => availableRoles.has(token));
    if (satisfied) {
      continue;
    }

    createIssue(issues, {
      category: "contract_violation",
      severity: "error",
      target_refs: [{ ref_id: document.framework.name, role: "framework" }],
      message: `framework requirement ${rule.value} が満たされていない。`,
      rationale: "framework requires で指定された要素が文書内に存在しない。",
    });
  }
}

function auditDecisionStep(
  issues: AuditIssue[],
  ids: Set<string>,
  step: { id: string; statement: StepStatement },
): void {
  if (step.statement.role !== "decision") {
    return;
  }

  if (step.statement.basedOn.length === 0) {
    createIssue(issues, {
      category: "contract_violation",
      severity: "error",
      target_refs: [statementReference(step.statement, step.id)],
      message: `decision ${step.statement.id} に根拠参照がない。`,
      rationale:
        "decision は based_on に premise または evidence を持つことが推奨される。",
      suggestion: "based_on を追加する。",
    });
  }

  for (const ref of step.statement.basedOn) {
    if (ids.has(ref)) {
      continue;
    }
    createIssue(issues, {
      category: "contract_violation",
      severity: "fatal",
      target_refs: [statementReference(step.statement, step.id)],
      message: `decision ${step.statement.id} の参照 ${ref} を解決できない。`,
      rationale: "based_on の参照先が文書内に存在しない。",
    });
  }
}

function auditStepContracts(
  issues: AuditIssue[],
  document: DocumentAst,
  ids: Set<string>,
): void {
  for (const step of document.steps) {
    auditDecisionStep(issues, ids, step);
    if (step.statement.role === "partition") {
      auditPartition(issues, step.statement, document);
    }
  }
}

function addContradictionCandidateIssues(
  issues: AuditIssue[],
  decisions: Array<{ stepId: string; statement: DecisionStatement }>,
): void {
  if (decisions.length < 2) {
    return;
  }

  const [first, ...rest] = decisions;
  for (const candidate of rest) {
    createIssue(issues, {
      category: "contradiction_candidate",
      severity: "warning",
      target_refs: [
        statementReference(first.statement, first.stepId),
        statementReference(candidate.statement, candidate.stepId),
      ],
      message: `${first.statement.id} と ${candidate.statement.id} は同一問題上で緊張関係にある可能性がある。`,
      rationale:
        "複数の decision が共存しているため、観点と整合性の再確認が必要である。",
    });
  }
}

function addPendingHintIssue(
  issues: AuditIssue[],
  pendingSteps: Array<{ stepId: string; statement: StepStatement }>,
  decisions: Array<{ stepId: string; statement: DecisionStatement }>,
): void {
  if (pendingSteps.length === 0 || decisions.length === 0) {
    return;
  }

  const pending = pendingSteps[0];
  createIssue(issues, {
    category: "semantic_hint",
    severity: "info",
    target_refs: [statementReference(pending.statement, pending.stepId)],
    message: "pending が存在するため、判断の確定度は下げて表示するべきである。",
  });
}

function addDecisionSemanticHint(
  issues: AuditIssue[],
  decisions: Array<{ stepId: string; statement: DecisionStatement }>,
  semanticContext: SemanticContext | undefined,
): void {
  if (decisions.length < 2) {
    return;
  }

  const semanticSimilarity = semanticContext
    ? cosineSimilarity(
        semanticContext.decisionEmbeddings[0] ?? [],
        semanticContext.decisionEmbeddings[1] ?? [],
      )
    : 0.75;
  createIssue(issues, {
    category: "semantic_hint",
    severity: "hint",
    target_refs: decisions
      .slice(0, 2)
      .map((decision) =>
        statementReference(decision.statement, decision.stepId),
      ),
    message: `${decisions[0]?.statement.id} と ${decisions[1]?.statement.id} は意味的に近接している可能性がある。`,
    metadata: {
      similarity: roundScore(semanticSimilarity),
      semantic_distance: roundScore(1 - semanticSimilarity),
      ...(semanticContext
        ? {
            embedding_provider: semanticContext.provider,
            embedding_model: semanticContext.model,
          }
        : {}),
    },
  });
}

function buildQueryResults(
  document: DocumentAst,
  decisions: Array<{ stepId: string; statement: DecisionStatement }>,
  semanticContext: SemanticContext | undefined,
): QueryResult[] {
  return document.queries.map((query, queryIndex) => ({
    query_id: query.id,
    severity: "hint",
    items: rankDecisionsForQuery(
      query.expression,
      queryIndex,
      decisions,
      semanticContext,
    ).map((item) => ({
      ref_id: item.ref_id,
      score: item.score,
      explanation: item.explanation,
    })),
  }));
}

function buildQuerySemanticText(
  document: DocumentAst,
  queryExpression: string,
): string {
  const problemId = extractRelatedDecisionProblemId(queryExpression);
  if (!problemId) {
    return queryExpression;
  }

  const problem = document.problems.find(
    (candidate) => candidate.name === problemId,
  );
  if (!problem) {
    return queryExpression;
  }

  return `${queryExpression}\nproblem: ${problem.text}`;
}

async function auditDocument(
  document: DocumentAst,
  documentId: string,
  options?: AuditOptions,
): Promise<AuditReport> {
  const issues: AuditIssue[] = [];
  const ids = collectDeclaredIds(document);
  const pendingSteps = findPending(document);
  const decisions = findDecisions(document);

  auditFrameworkRequirements(issues, document);
  auditStepContracts(issues, document, ids);
  addContradictionCandidateIssues(issues, decisions);
  addPendingHintIssue(issues, pendingSteps, decisions);

  const semanticContext = await createSemanticContext(
    decisions,
    document.queries.map((query) =>
      buildQuerySemanticText(document, query.expression),
    ),
    options,
  );
  addDecisionSemanticHint(issues, decisions, semanticContext);

  const queryResults = buildQueryResults(document, decisions, semanticContext);

  return {
    engine_version: ENGINE_VERSION,
    document_id: documentId,
    generated_at: new Date().toISOString(),
    summary: summarize(issues),
    results: issues,
    query_results: queryResults,
  };
}

interface SemanticContext {
  decisionEmbeddings: number[][];
  queryEmbeddings: number[][];
  provider: string;
  model: string;
}

async function createSemanticContext(
  decisions: Array<{ stepId: string; statement: DecisionStatement }>,
  queries: string[],
  options?: AuditOptions,
): Promise<SemanticContext | undefined> {
  if (decisions.length === 0) {
    return undefined;
  }

  try {
    const result = await embedTexts(
      [...decisions.map((decision) => decision.statement.text), ...queries],
      options?.embeddings,
    );
    if (!result) {
      return undefined;
    }

    return {
      decisionEmbeddings: result.embeddings.slice(0, decisions.length),
      queryEmbeddings: result.embeddings.slice(decisions.length),
      provider: result.provider,
      model: result.model,
    };
  } catch {
    return undefined;
  }
}

function roundScore(value: number): number {
  const normalized = Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0;
  return Number(normalized.toFixed(4));
}

function rankDecisionsForQuery(
  queryExpression: string,
  queryIndex: number,
  decisions: Array<{ stepId: string; statement: DecisionStatement }>,
  semanticContext: SemanticContext | undefined,
): Array<{ ref_id: string; score: number; explanation: string }> {
  if (!semanticContext || !semanticContext.queryEmbeddings[queryIndex]) {
    return decisions.map((decision, index) => ({
      ref_id: decision.statement.id,
      score: Math.max(0.5, 1 - index * 0.1),
      explanation: `${queryExpression} に関連する decision 候補。`,
    }));
  }

  return decisions
    .map((decision, index) => {
      const similarity = cosineSimilarity(
        semanticContext.queryEmbeddings[queryIndex] ?? [],
        semanticContext.decisionEmbeddings[index] ?? [],
      );
      return {
        ref_id: decision.statement.id,
        score: roundScore(similarity),
        explanation: `${queryExpression} に関連する decision 候補。 (${semanticContext.provider}/${semanticContext.model})`,
      };
    })
    .sort((left, right) => right.score - left.score);
}

function auditPartition(
  issues: AuditIssue[],
  partition: PartitionStatement,
  document: DocumentAst,
): void {
  const domainExists = document.domains.some(
    (domain) => domain.name === partition.domainName,
  );
  if (!domainExists) {
    createIssue(issues, {
      category: "mece_assessment",
      severity: "warning",
      target_refs: [{ ref_id: partition.id, role: "partition" }],
      message: `partition ${partition.id} の domain ${partition.domainName} を解決できない。`,
      rationale: "partition は既存 domain に対して定義される必要がある。",
    });
  }
  if (!partition.axis) {
    createIssue(issues, {
      category: "mece_assessment",
      severity: "warning",
      target_refs: [{ ref_id: partition.id, role: "partition" }],
      message: `partition ${partition.id} に axis がない。`,
    });
  }
  const othersMember = partition.members.find(
    (member) => member.name === "Others",
  );
  if (othersMember && !/not\s+[A-Za-z]/.test(othersMember.predicate)) {
    createIssue(issues, {
      category: "mece_assessment",
      severity: "warning",
      target_refs: [{ ref_id: partition.id, role: "partition" }],
      message: `partition ${partition.id} の Others が補集合として記述されていない。`,
      rationale: "Others は補集合として定義する前提である。",
    });
  }
}

export async function auditDslText(
  input: string,
  documentId = "document",
  options?: AuditOptions,
): Promise<AuditReport> {
  if (isDslHelpRequest(input)) {
    return createDslGuidanceReport(documentId);
  }

  try {
    const document = parseDocument(input);
    return auditDocument(document, documentId, options);
  } catch (error) {
    if (error instanceof ParseError) {
      return createParseErrorReport(error, documentId);
    }
    throw error;
  }
}

export async function auditDslFile(
  filePath: string,
  options?: AuditOptions,
): Promise<AuditReport> {
  const input = readFileSync(filePath, "utf8");
  const documentId = basename(filePath).replace(/\.dsl$/, "");
  return auditDslText(input, documentId, options);
}
