import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { createDslGuidanceReport, createParseErrorReport, isDslHelpRequest, } from "../dsl/guidance.js";
import { collectDslqlReferenceIds, DslqlParseError, evaluateDslqlExpression, parseDslqlExpression, } from "../dslql/query.js";
import { ParseError, parseDocument } from "../parser/parser.js";
import { cosineSimilarity, embedTexts, } from "../semantic/embeddings.js";
const ENGINE_VERSION = "0.1.0";
function statementIdentifierColumn(statement) {
    const keywordLength = `${statement.role} `.length;
    return statement.span.column + keywordLength;
}
function statementIdentifierEndColumn(statement) {
    return statementIdentifierColumn(statement) + statement.id.length;
}
function basedOnReferenceColumn(statement, ref) {
    const basedOnPrefixLength = statement.span.column +
        `decision ${statement.id} based_on `.length;
    const beforeRefLength = statement.basedOn
        .slice(0, statement.basedOn.indexOf(ref))
        .join(", ").length;
    const separatorLength = statement.basedOn.indexOf(ref) > 0 ? 2 : 0;
    return basedOnPrefixLength + beforeRefLength + separatorLength;
}
function frameworkRuleValueColumn(kind) {
    return 3 + kind.length + 1;
}
function queryArgumentColumn(expression, queryColumn, ref) {
    const index = expression.indexOf(ref);
    return queryColumn + (index >= 0 ? index : 0);
}
function overlappingBasedOnRefs(left, right) {
    const rightRefs = new Set(right.basedOn);
    return left.basedOn.filter((ref) => rightRefs.has(ref));
}
function issueId(index) {
    return `ISSUE-${String(index).padStart(3, "0")}`;
}
function statementReference(statement, stepId) {
    return {
        ref_id: statement.id,
        role: statement.role,
        step_id: stepId,
    };
}
function summarize(results) {
    const counts = {
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
function createIssue(issues, partial) {
    issues.push({ issue_id: issueId(issues.length + 1), ...partial });
}
function collectDeclaredIds(document) {
    const ids = new Set();
    for (const problem of document.problems)
        ids.add(problem.name);
    for (const step of document.steps)
        ids.add(step.statement.id);
    return ids;
}
function hasIntentionalOrphanAnnotation(annotations) {
    return annotations.some((annotation) => annotation.kind === "orphan_future" ||
        annotation.kind === "orphan_reference");
}
const STATUS_VALUES = ["rejected", "negated", "superseded"];
const STATUS_VALUE_SET = new Set(STATUS_VALUES);
function annotationTargetReference(target) {
    return {
        ref_id: target.id,
        role: target.role,
        step_id: target.stepId,
    };
}
function collectStatusValues(annotations) {
    return annotations
        .filter((annotation) => annotation.kind === "status")
        .map((annotation) => ({ annotation, value: annotation.text.trim() }));
}
function hasStatus(annotations, statuses) {
    const statusSet = new Set(statuses);
    return collectStatusValues(annotations).some(({ value }) => statusSet.has(value));
}
function hasAnnotationKind(annotations, kind) {
    return annotations.some((annotation) => annotation.kind === kind);
}
function collectDirectDecisionRefs(document) {
    const refs = new Set();
    for (const step of document.steps) {
        if (step.statement.role !== "decision") {
            continue;
        }
        for (const ref of step.statement.basedOn) {
            refs.add(ref);
        }
    }
    return refs;
}
function findDecisions(document) {
    const decisions = [];
    for (const step of document.steps) {
        if (step.statement.role === "decision") {
            decisions.push({ stepId: step.id, statement: step.statement });
        }
    }
    return decisions;
}
function findComparisons(document) {
    const comparisons = [];
    for (const step of document.steps) {
        if (step.statement.role === "comparison") {
            comparisons.push({ stepId: step.id, statement: step.statement });
        }
    }
    return comparisons;
}
function findPending(document) {
    return document.steps
        .filter((step) => step.statement.role === "pending")
        .map((step) => ({ stepId: step.id, statement: step.statement }));
}
function tokenizeFrameworkRequirementClause(value) {
    return value
        .split(/\s+and\s+/)
        .map((token) => token.trim())
        .filter(Boolean);
}
function evaluateFrameworkRequirement(value, availableRoles) {
    const clauses = value
        .split(/\s+or\s+/)
        .map((clause) => tokenizeFrameworkRequirementClause(clause));
    return clauses.some((clause) => clause.length > 0 && clause.every((token) => availableRoles.has(token)));
}
function collectAvailableRoles(document) {
    const stepRoles = document.steps.map((step) => step.statement.role);
    const topLevelRoles = [
        ...(document.problems.length > 0 ? ["problem"] : []),
        ...(document.framework ? ["framework"] : []),
    ];
    return new Set([...stepRoles, ...topLevelRoles]);
}
function auditFrameworkRequirements(issues, document) {
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
function auditQueryReferences(issues, document, ids) {
    for (const query of document.queries) {
        try {
            parseDslqlExpression(query.expression);
        }
        catch (error) {
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
function auditDecisionStep(issues, ids, step) {
    if (step.statement.role !== "decision") {
        return;
    }
    if (step.statement.basedOn.length === 0) {
        createIssue(issues, {
            category: "contract_violation",
            severity: "error",
            target_refs: [statementReference(step.statement, step.id)],
            message: `decision ${step.statement.id} に根拠参照がない。`,
            rationale: "decision は based_on に declared problem id または statement id を持つことが推奨される。",
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
function auditComparisonStep(issues, document, step) {
    if (step.statement.role !== "comparison") {
        return;
    }
    const comparison = step.statement;
    const checks = [
        {
            ok: document.problems.some((problem) => problem.name === comparison.problemId),
            ref: comparison.problemId,
            message: `comparison ${comparison.id} の problem ${comparison.problemId} を解決できない。`,
        },
        {
            ok: document.steps.some((candidate) => candidate.statement.role === "viewpoint" &&
                candidate.statement.id === comparison.viewpointId),
            ref: comparison.viewpointId,
            message: `comparison ${comparison.id} の viewpoint ${comparison.viewpointId} を解決できない。`,
        },
        {
            ok: document.steps.some((candidate) => candidate.statement.role === "decision" &&
                candidate.statement.id === comparison.leftDecisionId),
            ref: comparison.leftDecisionId,
            message: `comparison ${comparison.id} の decision ${comparison.leftDecisionId} を解決できない。`,
        },
        {
            ok: document.steps.some((candidate) => candidate.statement.role === "decision" &&
                candidate.statement.id === comparison.rightDecisionId),
            ref: comparison.rightDecisionId,
            message: `comparison ${comparison.id} の decision ${comparison.rightDecisionId} を解決できない。`,
        },
    ];
    for (const check of checks) {
        if (check.ok) {
            continue;
        }
        createIssue(issues, {
            category: "contract_violation",
            severity: "fatal",
            target_refs: [statementReference(comparison, step.id)],
            message: check.message,
            rationale: "comparison は problem、viewpoint、左右の decision を明示参照で解決できる必要がある。",
            metadata: {
                line: comparison.span.line,
                column: statementIdentifierColumn(comparison),
                end_column: statementIdentifierEndColumn(comparison),
                unresolved_ref: check.ref,
            },
        });
    }
}
function addComparisonConsistencyIssues(issues, comparisons) {
    const scopedComparisons = new Map();
    for (const comparison of comparisons) {
        const scopeKey = `${comparison.statement.problemId}::${comparison.statement.viewpointId}`;
        const current = scopedComparisons.get(scopeKey) ?? [];
        current.push(comparison);
        scopedComparisons.set(scopeKey, current);
    }
    for (const scopeComparisons of scopedComparisons.values()) {
        const preferredEdges = new Map();
        const incomparablePairs = new Set();
        const addPreferredEdge = (from, to) => {
            const current = preferredEdges.get(from) ?? new Set();
            current.add(to);
            preferredEdges.set(from, current);
        };
        for (const comparison of scopeComparisons) {
            if (comparison.statement.relation === "preferred_over") {
                addPreferredEdge(comparison.statement.leftDecisionId, comparison.statement.rightDecisionId);
            }
            if (comparison.statement.relation === "weaker_than") {
                addPreferredEdge(comparison.statement.rightDecisionId, comparison.statement.leftDecisionId);
            }
            if (comparison.statement.relation === "incomparable") {
                incomparablePairs.add([comparison.statement.leftDecisionId, comparison.statement.rightDecisionId]
                    .sort()
                    .join("::"));
            }
        }
        for (const comparison of scopeComparisons) {
            const pairKey = [comparison.statement.leftDecisionId, comparison.statement.rightDecisionId]
                .sort()
                .join("::");
            if ((comparison.statement.relation === "preferred_over" ||
                comparison.statement.relation === "weaker_than") &&
                incomparablePairs.has(pairKey)) {
                createIssue(issues, {
                    category: "contradiction_candidate",
                    severity: "warning",
                    target_refs: [statementReference(comparison.statement, comparison.stepId)],
                    message: `comparison ${comparison.statement.id} は incomparable と preference の両方を同じ decision 組に与えている。`,
                    rationale: "同じ problem / viewpoint scope で incomparable と優先関係が同居すると比較関係が不整合になる。",
                    metadata: {
                        line: comparison.statement.span.line,
                        column: statementIdentifierColumn(comparison.statement),
                        end_column: statementIdentifierEndColumn(comparison.statement),
                    },
                });
            }
        }
        const hasPath = (origin, current, seen) => {
            const next = preferredEdges.get(current);
            if (!next) {
                return false;
            }
            for (const candidate of next) {
                if (candidate === origin) {
                    return true;
                }
                if (seen.has(candidate)) {
                    continue;
                }
                seen.add(candidate);
                if (hasPath(origin, candidate, seen)) {
                    return true;
                }
            }
            return false;
        };
        for (const comparison of scopeComparisons) {
            if (comparison.statement.relation !== "preferred_over" &&
                comparison.statement.relation !== "weaker_than") {
                continue;
            }
            const from = comparison.statement.relation === "preferred_over"
                ? comparison.statement.leftDecisionId
                : comparison.statement.rightDecisionId;
            const to = comparison.statement.relation === "preferred_over"
                ? comparison.statement.rightDecisionId
                : comparison.statement.leftDecisionId;
            if (hasPath(from, to, new Set([to]))) {
                createIssue(issues, {
                    category: "contradiction_candidate",
                    severity: "warning",
                    target_refs: [statementReference(comparison.statement, comparison.stepId)],
                    message: `comparison ${comparison.statement.id} が preference cycle を形成している可能性がある。`,
                    rationale: "preferred_over / weaker_than を正規化した優先関係に循環があると partial order として解釈しにくい。",
                    metadata: {
                        line: comparison.statement.span.line,
                        column: statementIdentifierColumn(comparison.statement),
                        end_column: statementIdentifierEndColumn(comparison.statement),
                    },
                });
            }
        }
    }
}
function collectStatusTargets(document) {
    const targets = document.problems.map((problem) => ({
        id: problem.name,
        role: "problem",
        annotations: problem.annotations,
        span: problem.span,
    }));
    for (const step of document.steps) {
        if (!("annotations" in step.statement)) {
            continue;
        }
        targets.push({
            id: step.statement.id,
            role: step.statement.role,
            stepId: step.id,
            annotations: step.statement.annotations,
            span: step.statement.span,
        });
    }
    return targets;
}
function addStatusAnnotationIssues(issues, document, decisions, comparisons) {
    const targets = collectStatusTargets(document);
    const decisionById = new Map(decisions.map((decision) => [decision.statement.id, decision.statement]));
    const incomingCounterexamples = new Map();
    for (const comparison of comparisons) {
        if (comparison.statement.relation !== "counterexample_to") {
            continue;
        }
        const current = incomingCounterexamples.get(comparison.statement.rightDecisionId) ?? [];
        current.push(comparison.statement);
        incomingCounterexamples.set(comparison.statement.rightDecisionId, current);
    }
    for (const target of targets) {
        const statuses = collectStatusValues(target.annotations);
        if (statuses.length === 0) {
            continue;
        }
        for (const { annotation, value } of statuses) {
            if (STATUS_VALUE_SET.has(value)) {
                continue;
            }
            createIssue(issues, {
                category: "contract_violation",
                severity: "error",
                target_refs: [annotationTargetReference(target)],
                message: `${target.role} ${target.id} の annotation status ${value} は未定義である。`,
                rationale: `status は ${STATUS_VALUES.join(" / ")} のいずれかであるべきである。`,
                suggestion: "status 値を既知の集合へ修正する。",
                metadata: {
                    line: annotation.span.line,
                    column: annotation.span.column,
                    end_column: annotation.span.column + "annotation status".length,
                    status: value,
                },
            });
        }
        const distinctStatuses = new Set(statuses
            .map(({ value }) => value)
            .filter((value) => STATUS_VALUE_SET.has(value)));
        if (distinctStatuses.size > 1) {
            createIssue(issues, {
                category: "contract_violation",
                severity: "error",
                target_refs: [annotationTargetReference(target)],
                message: `${target.role} ${target.id} に排他的な status が併記されている。`,
                rationale: "status は単一の状態として解釈されるため、同一要素に複数の異なる状態を同時付与できない。",
                suggestion: "status を 1 つに絞る。",
                metadata: {
                    line: target.span.line,
                    column: target.span.column,
                    end_column: target.span.column + target.id.length,
                    statuses: [...distinctStatuses],
                },
            });
        }
    }
    for (const comparison of comparisons) {
        if (comparison.statement.relation !== "counterexample_to") {
            continue;
        }
        const leftDecision = decisionById.get(comparison.statement.leftDecisionId);
        const rightDecision = decisionById.get(comparison.statement.rightDecisionId);
        if (!leftDecision || !rightDecision) {
            continue;
        }
        const leftIsNegated = hasStatus(leftDecision.annotations, ["rejected", "negated"]);
        const rightIsNegated = hasStatus(rightDecision.annotations, ["rejected", "negated"]);
        if (!rightIsNegated) {
            createIssue(issues, {
                category: "semantic_hint",
                severity: leftIsNegated ? "warning" : "hint",
                target_refs: [statementReference(comparison.statement, comparison.stepId)],
                message: leftIsNegated
                    ? `comparison ${comparison.statement.id} は counterexample_to の左側 ${leftDecision.id} を negated/rejected にしており、向きと status が逆転している可能性がある。`
                    : `comparison ${comparison.statement.id} は counterexample_to の対象 ${rightDecision.id} に negated/rejected status がなく、反例の向きが監査上読み取りにくい。`,
                rationale: leftIsNegated
                    ? "counterexample_to は左側が反例、右側が崩される対象という向きで扱う。"
                    : "counterexample_to の右側が negated または rejected であると、反例により崩された対象を機械的に追いやすい。",
                suggestion: leftIsNegated
                    ? `status を ${rightDecision.id} 側へ移すか、comparison の左右を見直す。`
                    : `${rightDecision.id} に annotation status rejected か negated を付けることを検討する。`,
                metadata: {
                    line: comparison.statement.span.line,
                    column: statementIdentifierColumn(comparison.statement),
                    end_column: statementIdentifierEndColumn(comparison.statement),
                },
            });
        }
    }
    for (const decision of decisions) {
        const requiresSupport = hasStatus(decision.statement.annotations, ["rejected", "negated"]);
        if (!requiresSupport) {
            continue;
        }
        const hasCounterexample = (incomingCounterexamples.get(decision.statement.id) ?? []).length > 0;
        const hasRationale = hasAnnotationKind(decision.statement.annotations, "rationale");
        if (hasCounterexample || hasRationale) {
            continue;
        }
        createIssue(issues, {
            category: "semantic_hint",
            severity: "info",
            target_refs: [statementReference(decision.statement, decision.stepId)],
            message: `decision ${decision.statement.id} は negated/rejected status を持つが、その根拠となる counterexample_to comparison または rationale がない。`,
            rationale: "否定系 status は、比較関係または注記理由と対で残すと後続の監査と読解が安定する。",
            suggestion: "対応する comparison を追加するか、annotation rationale で理由を補う。",
            metadata: {
                line: decision.statement.span.line,
                column: statementIdentifierColumn(decision.statement),
                end_column: statementIdentifierEndColumn(decision.statement),
            },
        });
    }
}
function auditStepContracts(issues, document, ids) {
    for (const step of document.steps) {
        auditDecisionStep(issues, ids, step);
        auditComparisonStep(issues, document, step);
        if (step.statement.role === "partition") {
            auditPartition(issues, step.statement, document);
        }
    }
}
function addContradictionCandidateIssues(issues, decisions) {
    if (decisions.length < 2) {
        return;
    }
    for (let index = 0; index < decisions.length - 1; index += 1) {
        const current = decisions[index];
        for (let candidateIndex = index + 1; candidateIndex < decisions.length; candidateIndex += 1) {
            const candidate = decisions[candidateIndex];
            const overlaps = overlappingBasedOnRefs(current.statement, candidate.statement);
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
                rationale: "複数の decision が同じ based_on 参照を共有しているため、観点と結論の整合性を再確認するべきである。",
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
function addPendingHintIssue(issues, pendingSteps, decisions) {
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
function addOrphanNodeIssues(issues, document, directDecisionRefs) {
    for (const problem of document.problems) {
        if (directDecisionRefs.has(problem.name) ||
            hasIntentionalOrphanAnnotation(problem.annotations)) {
            continue;
        }
        createIssue(issues, {
            category: "semantic_hint",
            severity: "warning",
            target_refs: [{ ref_id: problem.name, role: "problem" }],
            message: `problem ${problem.name} がどの decision からも直接参照されていない。`,
            rationale: "problem は explicit based_on graph 上で少なくとも 1 つの decision から直接参照されると、解決対象との対応が読みやすくなる。",
            suggestion: "対応する decision の based_on に追加するか、意図的な孤立であれば orphan_future / orphan_reference annotation を付ける。",
            metadata: {
                line: problem.span.line,
                column: problem.span.column + "problem ".length,
                end_column: problem.span.column + "problem ".length + problem.name.length,
                orphan_rule: "problem_direct_incoming_edge",
            },
        });
    }
    for (const step of document.steps) {
        if (step.statement.role !== "premise" &&
            step.statement.role !== "evidence") {
            continue;
        }
        if (directDecisionRefs.has(step.statement.id) ||
            hasIntentionalOrphanAnnotation(step.statement.annotations)) {
            continue;
        }
        createIssue(issues, {
            category: "semantic_hint",
            severity: "hint",
            target_refs: [statementReference(step.statement, step.id)],
            message: `${step.statement.role} ${step.statement.id} がどの decision からも直接参照されていない。`,
            rationale: "supporting node が explicit based_on graph に現れないと、何の判断を支える記述なのか再読時に追いにくい。",
            suggestion: "対応する decision の based_on に追加するか、意図的な孤立であれば orphan_future / orphan_reference annotation を付ける。",
            metadata: {
                line: step.statement.span.line,
                column: statementIdentifierColumn(step.statement),
                end_column: statementIdentifierEndColumn(step.statement),
                orphan_rule: "supporting_node_direct_incoming_edge",
            },
        });
    }
}
function addDecisionSemanticHint(issues, decisions, semanticContext) {
    if (decisions.length < 2) {
        return;
    }
    const semanticSimilarity = semanticContext
        ? cosineSimilarity(semanticContext.decisionEmbeddings[0] ?? [], semanticContext.decisionEmbeddings[1] ?? [])
        : 0.75;
    createIssue(issues, {
        category: "semantic_hint",
        severity: "hint",
        target_refs: decisions
            .slice(0, 2)
            .map((decision) => statementReference(decision.statement, decision.stepId)),
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
function buildQueryResults(document, decisions, semanticContext) {
    const runtime = createDslqlRuntime(document);
    return document.queries.map((query, queryIndex) => ({
        query_id: query.id,
        severity: "hint",
        items: rankDecisionsForQuery(query.expression, queryIndex, decisions, semanticContext, collectDecisionIdsFromQuery(query.expression, runtime)).map((item) => ({
            ref_id: item.ref_id,
            score: item.score,
            explanation: item.explanation,
        })),
    }));
}
function buildQuerySemanticText(document, queryExpression) {
    const problemTexts = collectDslqlReferenceIds(queryExpression)
        .map((problemId) => document.problems.find((candidate) => candidate.name === problemId))
        .filter((problem) => Boolean(problem))
        .map((problem) => problem.text);
    return problemTexts.length === 0
        ? queryExpression
        : `${queryExpression}\n${problemTexts.map((text) => `problem: ${text}`).join("\n")}`;
}
async function auditDocument(document, documentId, options) {
    const issues = [];
    const ids = collectDeclaredIds(document);
    const directDecisionRefs = collectDirectDecisionRefs(document);
    const pendingSteps = findPending(document);
    const decisions = findDecisions(document);
    const comparisons = findComparisons(document);
    auditFrameworkRequirements(issues, document);
    auditStepContracts(issues, document, ids);
    auditQueryReferences(issues, document, ids);
    addOrphanNodeIssues(issues, document, directDecisionRefs);
    addContradictionCandidateIssues(issues, decisions);
    addComparisonConsistencyIssues(issues, comparisons);
    addStatusAnnotationIssues(issues, document, decisions, comparisons);
    addPendingHintIssue(issues, pendingSteps, decisions);
    const semanticContext = await createSemanticContext(decisions, document.queries.map((query) => buildQuerySemanticText(document, query.expression)), options);
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
async function createSemanticContext(decisions, queries, options) {
    if (decisions.length === 0) {
        return undefined;
    }
    try {
        const result = await embedTexts([...decisions.map((decision) => decision.statement.text), ...queries], options?.embeddings);
        if (!result) {
            return undefined;
        }
        return {
            decisionEmbeddings: result.embeddings.slice(0, decisions.length),
            queryEmbeddings: result.embeddings.slice(decisions.length),
            provider: result.provider,
            model: result.model,
        };
    }
    catch {
        return undefined;
    }
}
function roundScore(value) {
    const normalized = Number.isFinite(value)
        ? Math.max(0, Math.min(1, value))
        : 0;
    return Number(normalized.toFixed(4));
}
function rankDecisionsForQuery(queryExpression, queryIndex, decisions, semanticContext, allowedDecisionIds) {
    const candidateDecisions = decisions.filter((decision) => !allowedDecisionIds || allowedDecisionIds.has(decision.statement.id));
    if (!semanticContext || !semanticContext.queryEmbeddings[queryIndex]) {
        return candidateDecisions.map((decision, index) => ({
            ref_id: decision.statement.id,
            score: Math.max(0.5, 1 - index * 0.1),
            explanation: `${queryExpression} に関連する decision 候補。`,
        }));
    }
    return candidateDecisions
        .map((decision) => {
        const decisionIndex = decisions.findIndex((candidate) => candidate.statement.id === decision.statement.id);
        const similarity = cosineSimilarity(semanticContext.queryEmbeddings[queryIndex] ?? [], semanticContext.decisionEmbeddings[decisionIndex] ?? []);
        return {
            ref_id: decision.statement.id,
            score: roundScore(similarity),
            explanation: `${queryExpression} に関連する decision 候補。 (${semanticContext.provider}/${semanticContext.model})`,
        };
    })
        .sort((left, right) => right.score - left.score);
}
function normalizeStepStatement(step) {
    return {
        step_id: step.id,
        role: step.statement.role,
        id: step.statement.id,
        text: "text" in step.statement ? step.statement.text : null,
        based_on: step.statement.role === "decision" ? step.statement.basedOn : [],
        ...(step.statement.role === "comparison"
            ? {
                problem_id: step.statement.problemId,
                viewpoint_id: step.statement.viewpointId,
                relation: step.statement.relation,
                left_decision_id: step.statement.leftDecisionId,
                right_decision_id: step.statement.rightDecisionId,
            }
            : {}),
        span: {
            line: step.statement.span.line,
            column: step.statement.span.column,
        },
        source_kind: "draft",
    };
}
function createDslqlRuntime(document) {
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
function collectDecisionIdsFromQuery(queryExpression, runtime) {
    try {
        const values = evaluateDslqlExpression(queryExpression, runtime);
        const ids = values
            .filter((value) => typeof value === "object" && value !== null && !Array.isArray(value))
            .filter((value) => value.role === "decision" && typeof value.id === "string")
            .map((value) => String(value.id));
        return new Set(ids);
    }
    catch {
        return undefined;
    }
}
function auditPartition(issues, partition, document) {
    const domainExists = document.domains.some((domain) => domain.name === partition.domainName);
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
                end_column: partition.span.column +
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
    const othersMember = partition.members.find((member) => member.name === "Others");
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
export async function auditDslText(input, documentId = "document", options) {
    if (isDslHelpRequest(input)) {
        return createDslGuidanceReport(documentId);
    }
    try {
        const document = parseDocument(input);
        return auditDocument(document, documentId, options);
    }
    catch (error) {
        if (error instanceof ParseError) {
            return createParseErrorReport(error, documentId);
        }
        throw error;
    }
}
export async function auditDslFile(filePath, options) {
    const input = readFileSync(filePath, "utf8");
    const documentId = basename(filePath).replace(/\.dsl$/, "");
    return auditDslText(input, documentId, options);
}
//# sourceMappingURL=audit.js.map