import { readFileSync } from "node:fs";
import { basename } from "node:path";

import type { DecisionStatement, DocumentAst, PartitionStatement, StepStatement } from "../model/ast.js";
import type { AuditIssue, AuditReference, AuditReport, AuditSeverity, QueryResult } from "../model/diagnostics.js";
import { ParseError, parseDocument } from "../parser/parser.js";

const ENGINE_VERSION = "0.1.0";

function issueId(index: number): string {
  return `ISSUE-${String(index).padStart(3, "0")}`;
}

function statementReference(statement: StepStatement, stepId?: string): AuditReference {
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

function findDecisions(document: DocumentAst): Array<{ stepId: string; statement: DecisionStatement }> {
  const decisions: Array<{ stepId: string; statement: DecisionStatement }> = [];
  for (const step of document.steps) {
    if (step.statement.role === "decision") {
      decisions.push({ stepId: step.id, statement: step.statement });
    }
  }
  return decisions;
}

function findPending(document: DocumentAst): Array<{ stepId: string; statement: StepStatement }> {
  return document.steps.filter((step) => step.statement.role === "pending").map((step) => ({ stepId: step.id, statement: step.statement }));
}

function auditDocument(document: DocumentAst, documentId: string): AuditReport {
  const issues: AuditIssue[] = [];
  const ids = collectDeclaredIds(document);

  if (document.framework) {
    for (const rule of document.framework.rules.filter((rule) => rule.kind === "requires")) {
      const requiredTokens = rule.value.split(/\s+(?:or|and)\s+/).map((value) => value.trim());
      const stepRoles = new Set(document.steps.map((step) => step.statement.role));
      const topLevelRoles = new Set<string>([
        ...(document.problems.length > 0 ? ["problem"] : []),
        ...(document.framework ? ["framework"] : []),
      ]);
      const allRoles = new Set<string>([...stepRoles, ...topLevelRoles]);
      const satisfied = requiredTokens.some((token) => allRoles.has(token));
      if (!satisfied) {
        createIssue(issues, {
          category: "contract_violation",
          severity: "error",
          target_refs: [{ ref_id: document.framework.name, role: "framework" }],
          message: `framework requirement ${rule.value} が満たされていない。`,
          rationale: "framework requires で指定された要素が文書内に存在しない。",
        });
      }
    }
  }

  for (const step of document.steps) {
    if (step.statement.role === "decision" && step.statement.basedOn.length === 0) {
      createIssue(issues, {
        category: "contract_violation",
        severity: "error",
        target_refs: [statementReference(step.statement, step.id)],
        message: `decision ${step.statement.id} に根拠参照がない。`,
        rationale: "decision は based_on に premise または evidence を持つことが推奨される。",
        suggestion: "based_on を追加する。",
      });
    }

    if (step.statement.role === "decision") {
      for (const ref of step.statement.basedOn) {
        if (!ids.has(ref)) {
          createIssue(issues, {
            category: "contract_violation",
            severity: "fatal",
            target_refs: [statementReference(step.statement, step.id)],
            message: `decision ${step.statement.id} の参照 ${ref} を解決できない。`,
            rationale: "based_on の参照先が文書内に存在しない。",
          });
        }
      }
    }

    if (step.statement.role === "partition") {
      auditPartition(issues, step.statement, document);
    }
  }

  const decisions = findDecisions(document);
  if (decisions.length >= 2) {
    const [first, ...rest] = decisions;
    for (const candidate of rest) {
      createIssue(issues, {
        category: "contradiction_candidate",
        severity: "warning",
        target_refs: [statementReference(first.statement, first.stepId), statementReference(candidate.statement, candidate.stepId)],
        message: `${first.statement.id} と ${candidate.statement.id} は同一問題上で緊張関係にある可能性がある。`,
        rationale: "複数の decision が共存しているため、観点と整合性の再確認が必要である。",
      });
    }
  }

  if (findPending(document).length > 0 && decisions.length > 0) {
    const pending = findPending(document)[0];
    createIssue(issues, {
      category: "semantic_hint",
      severity: "info",
      target_refs: [statementReference(pending.statement, pending.stepId)],
      message: "pending が存在するため、判断の確定度は下げて表示するべきである。",
    });
  }

  if (decisions.length >= 2) {
    createIssue(issues, {
      category: "semantic_hint",
      severity: "hint",
      target_refs: decisions.slice(0, 2).map((decision) => statementReference(decision.statement, decision.stepId)),
      message: `${decisions[0]?.statement.id} と ${decisions[1]?.statement.id} は意味的に近接している可能性がある。`,
      metadata: {
        similarity: 0.75,
        semantic_distance: 0.25,
      },
    });
  }

  const queryResults: QueryResult[] = document.queries.map((query) => ({
    query_id: query.id,
    severity: "hint",
    items: decisions.map((decision, index) => ({
      ref_id: decision.statement.id,
      score: Math.max(0.5, 1 - index * 0.1),
      explanation: `${query.expression} に関連する decision 候補。`,
    })),
  }));

  return {
    engine_version: ENGINE_VERSION,
    document_id: documentId,
    generated_at: new Date().toISOString(),
    summary: summarize(issues),
    results: issues,
    query_results: queryResults,
  };
}

function auditPartition(issues: AuditIssue[], partition: PartitionStatement, document: DocumentAst): void {
  const domainExists = document.domains.some((domain) => domain.name === partition.domainName);
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
  const othersMember = partition.members.find((member) => member.name === "Others");
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

export function auditText(input: string, documentId = "document"): AuditReport {
  const document = parseDocument(input);
  return auditDocument(document, documentId);
}

export function auditFile(filePath: string): AuditReport {
  const input = readFileSync(filePath, "utf8");
  const documentId = basename(filePath).replace(/\.dsl$/, "");
  try {
    return auditText(input, documentId);
  } catch (error) {
    if (error instanceof ParseError) {
      const issue: AuditIssue = {
        issue_id: "ISSUE-001",
        category: "contract_violation",
        severity: "fatal",
        target_refs: [{ ref_id: documentId }],
        message: error.message,
      };
      return {
        engine_version: ENGINE_VERSION,
        document_id: documentId,
        generated_at: new Date().toISOString(),
        summary: summarize([issue]),
        results: [issue],
        query_results: [],
      };
    }
    throw error;
  }
}