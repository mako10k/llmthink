import type {
  ConfidenceDecl,
  ConfidenceEdgeDecl,
  DocumentAst,
  StepStatement,
} from "../model/ast.js";
import {
  CONFIDENCE_PROFILE_ID,
  ConfidenceValueError,
  compareRationalValues,
  createConfidenceAssessment,
  DEFAULT_EDGE_CONFIDENCE,
  DEFAULT_SOURCE_CONFIDENCE,
  minimumRationalValue,
  multiplyConfidenceAssessments,
  serializeConfidenceAssessment,
  weakestEpistemicTag,
  type ConfidenceAssessment,
  type ConfidenceUnresolvedAggregationNode,
  type ConfidenceResult,
} from "../model/confidence.js";
import { createDocumentDeclarationIndex } from "../model/declarations.js";

interface ComputedNode {
  assessment: ConfidenceAssessment;
  weakestPath: string[];
  causeIds: string[];
  unresolvedAggregations: ConfidenceUnresolvedAggregationNode[];
  nodeKind: "source" | "derived";
}

interface FailedNode {
  reasons: string[];
  causeIds: string[];
  nodeKind: "source" | "derived";
}

type NodeEvaluation = ComputedNode | FailedNode;
type SourceConfidenceDeclaration = Extract<ConfidenceDecl, { kind: "source" }>;
type DeclaredConfidenceDeclaration = Extract<
  ConfidenceDecl,
  { kind: "declared" }
>;

function isComputed(value: NodeEvaluation): value is ComputedNode {
  return "assessment" in value;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function mergeUnresolvedAggregations(
  nodes: readonly ConfidenceUnresolvedAggregationNode[],
): ConfidenceUnresolvedAggregationNode[] {
  return [...new Map(nodes.map((node) => [node.target_id, node])).values()];
}

function sourceDeclarationMap(
  declarations: readonly ConfidenceDecl[],
): Map<string, SourceConfidenceDeclaration> {
  return new Map(
    declarations
      .filter(
        (declaration): declaration is SourceConfidenceDeclaration =>
          declaration.kind === "source",
      )
      .map((declaration) => [declaration.sourceId, declaration]),
  );
}

function declaredConfidenceMap(
  declarations: readonly ConfidenceDecl[],
): Map<string, DeclaredConfidenceDeclaration> {
  return new Map(
    declarations
      .filter(
        (declaration): declaration is DeclaredConfidenceDeclaration =>
          declaration.kind === "declared",
      )
      .map((declaration) => [declaration.targetId, declaration]),
  );
}

function incomingEdgeMap(
  declarations: readonly ConfidenceDecl[],
): Map<string, ConfidenceEdgeDecl[]> {
  const incoming = new Map<string, ConfidenceEdgeDecl[]>();
  for (const declaration of declarations) {
    if (declaration.kind !== "edge") continue;
    incoming.set(declaration.targetId, [
      ...(incoming.get(declaration.targetId) ?? []),
      declaration,
    ]);
  }
  return incoming;
}

function assessmentCauses(
  assessment: ConfidenceAssessment,
  id: string,
): string[] {
  return assessment.epistemicTag === "known" ? [] : [id];
}

function resultFromEvaluation(
  targetId: string,
  evaluation: NodeEvaluation,
  declaredAssessment?: ConfidenceAssessment,
): ConfidenceResult {
  const declaredFields = declaredAssessment
    ? {
        declared_assessment: serializeConfidenceAssessment(declaredAssessment),
      }
    : {};
  if (!isComputed(evaluation)) {
    return {
      target_id: targetId,
      node_kind: evaluation.nodeKind,
      status: "uncomputable",
      ...declaredFields,
      cause_ids: unique(evaluation.causeIds),
      reasons: unique(evaluation.reasons),
    };
  }
  const declaredComparison = declaredAssessment
    ? {
        declared_comparison: compareDeclaredConfidence(
          declaredAssessment,
          evaluation.assessment,
        ),
      }
    : {};
  return {
    target_id: targetId,
    node_kind: evaluation.nodeKind,
    status: "computed",
    assessment: serializeConfidenceAssessment(evaluation.assessment),
    ...declaredFields,
    ...declaredComparison,
    weakest_path: evaluation.weakestPath,
    ...(evaluation.unresolvedAggregations.length > 0
      ? {
          aggregation: {
            status: "unresolved_dependency" as const,
            baseline_method: "coordinate_min" as const,
            boost_applied: false as const,
            boosted_estimate: null,
            unresolved_nodes: evaluation.unresolvedAggregations,
          },
        }
      : {}),
    cause_ids: unique(evaluation.causeIds),
    reasons: [],
  };
}

function compareDeclaredConfidence(
  declared: ConfidenceAssessment,
  derived: ConfidenceAssessment,
): {
  relation:
    | "below_derived_interval"
    | "within_derived_interval"
    | "above_derived_interval";
} {
  if (compareRationalValues(declared.estimate, derived.lower) < 0) {
    return { relation: "below_derived_interval" };
  }
  if (compareRationalValues(declared.estimate, derived.upper) > 0) {
    return { relation: "above_derived_interval" };
  }
  return { relation: "within_derived_interval" };
}

function orderedConfidenceNodeIds(
  declarations: readonly ConfidenceDecl[],
): string[] {
  return unique(declarations.flatMap(confidenceDeclarationNodeIds));
}

function confidenceDeclarationNodeIds(declaration: ConfidenceDecl): string[] {
  if (declaration.kind === "source") return [declaration.sourceId];
  if (declaration.kind === "edge") {
    return [declaration.sourceId, declaration.targetId];
  }
  return [declaration.targetId];
}

interface PathEvaluation {
  assessment: ConfidenceAssessment;
  weakestPath: string[];
  causeIds: string[];
  unresolvedAggregations: ConfidenceUnresolvedAggregationNode[];
}

function isPathEvaluation(
  evaluation: PathEvaluation | FailedNode,
): evaluation is PathEvaluation {
  return "assessment" in evaluation;
}

class ConfidenceEvaluator {
  private readonly declarations: ReturnType<
    typeof createDocumentDeclarationIndex
  >;
  private readonly sources: ReturnType<typeof sourceDeclarationMap>;
  private readonly declared: ReturnType<typeof declaredConfidenceMap>;
  private readonly incoming: ReturnType<typeof incomingEdgeMap>;
  private readonly cache = new Map<string, NodeEvaluation>();
  private readonly visiting: string[] = [];

  constructor(private readonly document: DocumentAst) {
    this.declarations = createDocumentDeclarationIndex(document);
    this.sources = sourceDeclarationMap(document.confidence);
    this.declared = declaredConfidenceMap(document.confidence);
    this.incoming = incomingEdgeMap(document.confidence);
  }

  evaluateAll(): ConfidenceResult[] {
    return orderedConfidenceNodeIds(this.document.confidence).map((id) =>
      resultFromEvaluation(
        id,
        this.evaluateNode(id),
        this.declared.get(id)?.assessment,
      ),
    );
  }

  private findStatement(id: string): StepStatement | undefined {
    const declaration = this.declarations.get(id);
    return declaration?.kind === "statement"
      ? (declaration.node as StepStatement)
      : undefined;
  }

  private hasConfidenceNode(id: string): boolean {
    const declaration = this.declarations.get(id);
    return declaration?.kind === "problem" || declaration?.kind === "statement";
  }

  private hasDefaultSource(id: string): boolean {
    const role = this.findStatement(id)?.role;
    return role === "premise" || role === "evidence" || role === "decision";
  }

  private cycleFailure(id: string): FailedNode | undefined {
    const cycleIndex = this.visiting.indexOf(id);
    if (cycleIndex < 0) return undefined;
    const cycle = [...this.visiting.slice(cycleIndex), id];
    return {
      nodeKind: "derived",
      causeIds: cycle,
      reasons: [`confidence_cycle: ${cycle.join(" -> ")}`],
    };
  }

  private evaluateNode(id: string): NodeEvaluation {
    const cached = this.cache.get(id);
    if (cached) return cached;
    const cycle = this.cycleFailure(id);
    if (cycle) return cycle;

    const sourceDeclaration = this.sources.get(id);
    const declaredConfidence = this.declared.get(id);
    const edges = this.incoming.get(id) ?? [];
    if (declaredConfidence && edges.length === 0) {
      const failure: FailedNode = {
        nodeKind: "derived",
        causeIds: [id],
        reasons: [
          `declared_confidence target '${id}' requires incoming scoring edges and a derived confidence`,
        ],
      };
      this.cache.set(id, failure);
      return failure;
    }
    const evaluation =
      edges.length === 0
        ? this.evaluateSource(id, sourceDeclaration)
        : this.evaluateDerived(id, sourceDeclaration, edges);
    this.cache.set(id, evaluation);
    return evaluation;
  }

  private evaluateSource(
    id: string,
    sourceDeclaration: SourceConfidenceDeclaration | undefined,
  ): NodeEvaluation {
    if (!this.hasConfidenceNode(id)) {
      return {
        nodeKind: "source",
        causeIds: [id],
        reasons: [`confidence source '${id}' is unresolved`],
      };
    }
    if (!sourceDeclaration && !this.hasDefaultSource(id)) {
      return {
        nodeKind: "source",
        causeIds: [id],
        reasons: [
          `confidence source '${id}' requires an explicit source assessment`,
        ],
      };
    }
    const assessment =
      sourceDeclaration?.assessment ?? DEFAULT_SOURCE_CONFIDENCE;
    return {
      assessment,
      weakestPath: [id],
      causeIds: assessmentCauses(assessment, id),
      unresolvedAggregations: [],
      nodeKind: "source",
    };
  }

  private evaluateDerived(
    id: string,
    sourceDeclaration: SourceConfidenceDeclaration | undefined,
    edges: ConfidenceEdgeDecl[],
  ): NodeEvaluation {
    if (sourceDeclaration) {
      return {
        nodeKind: "derived",
        causeIds: [id],
        reasons: [
          `confidence source assessment '${id}' cannot override derived confidence`,
        ],
      };
    }
    const target = this.findStatement(id);
    if (target?.role !== "decision") {
      return {
        nodeKind: "derived",
        causeIds: [id],
        reasons: [`confidence edge target '${id}' must be a decision`],
      };
    }

    this.visiting.push(id);
    try {
      return this.combinePaths(
        id,
        edges.map((edge) => this.evaluateEdge(id, target, edge)),
      );
    } finally {
      this.visiting.pop();
    }
  }

  private evaluateEdge(
    targetId: string,
    target: Extract<StepStatement, { role: "decision" }>,
    edge: ConfidenceEdgeDecl,
  ): PathEvaluation | FailedNode {
    const edgeId = `${edge.sourceId}->${edge.targetId}`;
    if (!target.basedOn.includes(edge.sourceId)) {
      return {
        nodeKind: "derived",
        causeIds: [edgeId],
        reasons: [
          `scoring edge ${edge.sourceId} -> ${edge.targetId} is not declared by decision based_on`,
        ],
      };
    }
    const source = this.evaluateNode(edge.sourceId);
    if (!isComputed(source)) return source;

    const edgeAssessment = edge.assessment ?? DEFAULT_EDGE_CONFIDENCE;
    try {
      return {
        assessment: multiplyConfidenceAssessments(
          source.assessment,
          edgeAssessment,
        ),
        weakestPath: [...source.weakestPath, targetId],
        causeIds: [
          ...source.causeIds,
          ...assessmentCauses(edgeAssessment, edgeId),
        ],
        unresolvedAggregations: source.unresolvedAggregations,
      };
    } catch (error) {
      if (!(error instanceof ConfidenceValueError)) throw error;
      return {
        nodeKind: "derived",
        causeIds: [edgeId],
        reasons: [`confidence arithmetic limit: ${error.message}`],
      };
    }
  }

  private combinePaths(
    targetId: string,
    evaluations: Array<PathEvaluation | FailedNode>,
  ): NodeEvaluation {
    const failures = evaluations.filter(
      (evaluation): evaluation is FailedNode => !isPathEvaluation(evaluation),
    );
    const paths = evaluations.filter(isPathEvaluation);
    if (failures.length > 0 || paths.length === 0) {
      return {
        nodeKind: "derived",
        causeIds: failures.flatMap((failure) => failure.causeIds),
        reasons: failures.flatMap((failure) => failure.reasons),
      };
    }

    const weakestEstimate = paths
      .slice(1)
      .reduce(
        (weakest, candidate) =>
          compareRationalValues(
            candidate.assessment.estimate,
            weakest.assessment.estimate,
          ) < 0
            ? candidate
            : weakest,
        paths[0]!,
      );
    const unresolvedAggregations = mergeUnresolvedAggregations([
      ...paths.flatMap((path) => path.unresolvedAggregations),
      ...(paths.length > 1
        ? [{ target_id: targetId, parent_count: paths.length }]
        : []),
    ]);
    return {
      assessment: createConfidenceAssessment({
        lower: minimumRationalValue(paths.map((path) => path.assessment.lower)),
        estimate: minimumRationalValue(
          paths.map((path) => path.assessment.estimate),
        ),
        upper: minimumRationalValue(paths.map((path) => path.assessment.upper)),
        epistemicTag: weakestEpistemicTag(
          paths.map((path) => path.assessment.epistemicTag),
        ),
        origin: "derived",
        profileId: CONFIDENCE_PROFILE_ID,
      }),
      weakestPath: weakestEstimate.weakestPath,
      causeIds: paths.flatMap((path) => path.causeIds),
      unresolvedAggregations,
      nodeKind: "derived",
    };
  }
}

export function evaluateConfidence(document: DocumentAst): ConfidenceResult[] {
  return document.confidence.length === 0
    ? []
    : new ConfidenceEvaluator(document).evaluateAll();
}
