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
import {
  collectDslqlReferenceIds,
  DslqlParseError,
  evaluateDslqlExpression,
  parseDslqlExpression,
  type DslqlRuntime,
  type DslqlValue,
} from "../dslql/query.js";
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

function statementIdentifierColumn(statement: StepStatement): number {
  const keywordLength = `${statement.role} `.length;
  return statement.span.column + keywordLength;
}

function statementIdentifierEndColumn(statement: StepStatement): number {
  return statementIdentifierColumn(statement) + statement.id.length;
}

function basedOnReferenceColumn(
  statement: DecisionStatement,
  ref: string,
): number {
  const basedOnPrefixLength =
    statement.span.column +
    `decision ${statement.id} based_on `.length;
  const beforeRefLength = statement.basedOn
    .slice(0, statement.basedOn.indexOf(ref))
    .join(", ").length;
  const separatorLength = statement.basedOn.indexOf(ref) > 0 ? 2 : 0;
  return basedOnPrefixLength + beforeRefLength + separatorLength;
}

function frameworkRuleValueColumn(kind: string): number {
  return 3 + kind.length + 1;
}

function queryArgumentColumn(expression: string, queryColumn: number, ref: string): number {
  const index = expression.indexOf(ref);
  return queryColumn + (index >= 0 ? index : 0);
}

function overlappingBasedOnRefs(
  left: DecisionStatement,
  right: DecisionStatement,
): string[] {
  const rightRefs = new Set(right.basedOn);
  return left.basedOn.filter((ref) => rightRefs.has(ref));
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

function tokenizeFrameworkRequirementClause(value: string): string[] {
  return value
    .split(/\s+and\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function evaluateFrameworkRequirement(
  value: string,
  availableRoles: Set<string>,
): boolean {
  const clauses = value
    .split(/\s+or\s+/)
    .map((clause) => tokenizeFrameworkRequirementClause(clause));
  return clauses.some(
    (clause) => clause.length > 0 && clause.every((token) => availableRoles.has(token)),
  );
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

    const satisfied = evaluateFrameworkRequirement(rule.value, availableRoles);
    if (satisfied) {
      continue;
    }

    createIssue(issues, {
      category: "contract_violation",
      severity: "error",
      target_refs: [{ ref_id: document.framework.name, role: "framework" }],
      message: `framework requirement ${rule.value} が満たされていない。`,
      rationale: "framework requires で指定された要素が文書内に存在しない。",
      metadata: {
        line: rule.span.line,
        column: frameworkRuleValueColumn(rule.kind),
        end_column: frameworkRuleValueColumn(rule.kind) + rule.value.length,
      },
    });
  }
}

function auditQueryReferences(
  issues: AuditIssue[],
  document: DocumentAst,
  ids: Set<string>,
): void {
  for (const query of document.queries) {
    try {
      parseDslqlExpression(query.expression);
    } catch (error) {
      if (error instanceof DslqlParseError) {
        createIssue(issues, {
          category: "contract_violation",
          severity: "fatal",
          target_refs: [{ ref_id: query.id, role: "query" }],
          message: `query ${query.id} の DSLQL 構文が不正である。`,
          rationale: error.message,
          metadata: {
            line: query.expressionSpan.line,
            column: query.expressionSpan.column + error.column - 1,
            end_column: query.expressionSpan.column + error.endColumn - 1,
          },
        });
        continue;
      }
      throw error;
    }

    for (const ref of collectDslqlReferenceIds(query.expression)) {
      if (ids.has(ref)) {
        continue;
      }

      const column = queryArgumentColumn(query.expression, query.expressionSpan.column, ref);
      createIssue(issues, {
        category: "contract_violation",
        severity: "fatal",
        target_refs: [{ ref_id: query.id, role: "query" }],
        message: `query ${query.id} の参照 ${ref} を解決できない。`,
        rationale: "query 引数の参照先が文書内に存在しない。",
        metadata: {
          line: query.expressionSpan.line,
          column,
          end_column: column + ref.length,
          unresolved_ref: ref,
        },
      });
    }
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
        "decision は based_on に declared problem id または statement id を持つことが推奨される。",
      suggestion: "based_on を追加する。",
      metadata: {
        line: step.statement.span.line,
        column: statementIdentifierColumn(step.statement),
        end_column: statementIdentifierEndColumn(step.statement),
      },
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
      metadata: {
        line: step.statement.span.line,
        column: basedOnReferenceColumn(step.statement, ref),
        end_column: basedOnReferenceColumn(step.statement, ref) + ref.length,
        unresolved_ref: ref,
      },
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

  for (let index = 0; index < decisions.length - 1; index += 1) {
    const current = decisions[index];
    for (let candidateIndex = index + 1; candidateIndex < decisions.length; candidateIndex += 1) {
      const candidate = decisions[candidateIndex];
      const overlaps = overlappingBasedOnRefs(
        current.statement,
        candidate.statement,
      );
      if (overlaps.length === 0) {
        continue;
      }
      createIssue(issues, {
        category: "contradiction_candidate",
        severity: "hint",
        target_refs: [
          statementReference(current.statement, current.stepId),
          statementReference(candidate.statement, candidate.stepId),
        ],
        message: `${current.statement.id} と ${candidate.statement.id} は同一根拠 ${overlaps.join(", ")} を共有しており、緊張関係にある可能性がある。`,
        rationale:
          "複数の decision が同じ based_on 参照を共有しているため、観点と結論の整合性を再確認するべきである。",
        metadata: {
          shared_refs: overlaps,
          line: current.statement.span.line,
          column: statementIdentifierColumn(current.statement),
          end_column: statementIdentifierEndColumn(current.statement),
        },
      });
    }
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
    metadata: {
      line: pending.statement.span.line,
      column: statementIdentifierColumn(pending.statement),
      end_column: statementIdentifierEndColumn(pending.statement),
    },
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
      line: decisions[0]?.statement.span.line,
      column: decisions[0] ? statementIdentifierColumn(decisions[0].statement) : 1,
      end_column: decisions[0]
        ? statementIdentifierEndColumn(decisions[0].statement)
        : 1,
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
  const runtime = createDslqlRuntime(document);
  return document.queries.map((query, queryIndex) => ({
    query_id: query.id,
    severity: "hint",
    items: rankDecisionsForQuery(
      query.expression,
      queryIndex,
      decisions,
      semanticContext,
      collectDecisionIdsFromQuery(query.expression, runtime),
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
  const problemTexts = collectDslqlReferenceIds(queryExpression)
    .map((problemId) =>
      document.problems.find((candidate) => candidate.name === problemId),
    )
    .filter((problem): problem is DocumentAst["problems"][number] => Boolean(problem))
    .map((problem) => problem.text);

  return problemTexts.length === 0
    ? queryExpression
    : `${queryExpression}\n${problemTexts.map((text) => `problem: ${text}`).join("\n")}`;
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
  auditQueryReferences(issues, document, ids);
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
  allowedDecisionIds?: Set<string>,
): Array<{ ref_id: string; score: number; explanation: string }> {
  const candidateDecisions = decisions.filter(
    (decision) =>
      !allowedDecisionIds || allowedDecisionIds.has(decision.statement.id),
  );

  if (!semanticContext || !semanticContext.queryEmbeddings[queryIndex]) {
    return candidateDecisions.map((decision, index) => ({
      ref_id: decision.statement.id,
      score: Math.max(0.5, 1 - index * 0.1),
      explanation: `${queryExpression} に関連する decision 候補。`,
    }));
  }

  return candidateDecisions
    .map((decision) => {
      const decisionIndex = decisions.findIndex(
        (candidate) => candidate.statement.id === decision.statement.id,
      );
      const similarity = cosineSimilarity(
        semanticContext.queryEmbeddings[queryIndex] ?? [],
        semanticContext.decisionEmbeddings[decisionIndex] ?? [],
      );
      return {
        ref_id: decision.statement.id,
        score: roundScore(similarity),
        explanation: `${queryExpression} に関連する decision 候補。 (${semanticContext.provider}/${semanticContext.model})`,
      };
    })
    .sort((left, right) => right.score - left.score);
}

function normalizeStepStatement(step: DocumentAst["steps"][number]): DslqlValue {
  return {
    step_id: step.id,
    role: step.statement.role,
    id: step.statement.id,
    text: "text" in step.statement ? step.statement.text : null,
    based_on: step.statement.role === "decision" ? step.statement.basedOn : [],
    span: {
      line: step.statement.span.line,
      column: step.statement.span.column,
    },
    source_kind: "draft",
  };
}

function createDslqlRuntime(document: DocumentAst): DslqlRuntime {
  const decisionValues = document.steps
    .filter((step) => step.statement.role === "decision")
    .map(normalizeStepStatement);

  return {
    root: {
      document: {
        framework: document.framework ? { name: document.framework.name } : null,
        domains: document.domains.map((domain) => ({
          id: domain.name,
          description: domain.description,
        })),
        problems: document.problems.map((problem) => ({
          id: problem.name,
          text: problem.text,
        })),
        steps: document.steps.map(normalizeStepStatement),
        queries: document.queries.map((query) => ({
          id: query.id,
          expression: query.expression,
        })),
      },
      framework: document.framework ? { name: document.framework.name } : null,
      domains: document.domains.map((domain) => ({
        id: domain.name,
        description: domain.description,
      })),
      problems: document.problems.map((problem) => ({
        id: problem.name,
        text: problem.text,
      })),
      steps: document.steps.map(normalizeStepStatement),
      queries: document.queries.map((query) => ({
        id: query.id,
        expression: query.expression,
      })),
      audit: null,
      thought: null,
      search: [],
    },
    functions: {
      related_decisions: () => decisionValues,
      audit_findings: () => [],
    },
  };
}

function collectDecisionIdsFromQuery(
  queryExpression: string,
  runtime: DslqlRuntime,
): Set<string> | undefined {
  try {
    const values = evaluateDslqlExpression(queryExpression, runtime);
    const ids = values
      .filter(
        (value): value is Record<string, DslqlValue | undefined> =>
          typeof value === "object" && value !== null && !Array.isArray(value),
      )
      .filter((value) => value.role === "decision" && typeof value.id === "string")
      .map((value) => String(value.id));
    return new Set(ids);
  } catch {
    return undefined;
  }
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
      metadata: {
        line: partition.span.line,
        column: partition.span.column + `partition ${partition.id} on `.length,
        end_column:
          partition.span.column +
          `partition ${partition.id} on `.length +
          partition.domainName.length,
      },
    });
  }
  if (!partition.axis) {
    createIssue(issues, {
      category: "mece_assessment",
      severity: "warning",
      target_refs: [{ ref_id: partition.id, role: "partition" }],
      message: `partition ${partition.id} に axis がない。`,
      metadata: {
        line: partition.span.line,
        column: statementIdentifierColumn(partition),
        end_column: statementIdentifierEndColumn(partition),
      },
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
      metadata: {
        line: partition.span.line,
        column: statementIdentifierColumn(partition),
        end_column: statementIdentifierEndColumn(partition),
      },
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
