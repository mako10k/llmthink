export declare const CONFIDENCE_PROFILE_ID = "support-trace-v1";
export declare const MAX_RATIONAL_DIGITS = 256;
export type ConfidenceEpistemicTag = "known" | "estimated" | "unknown";
export type ConfidenceOrigin = "explicit" | "keyword" | "default" | "derived";
export type ConfidenceKeywordKind = "source" | "edge";
export declare const SOURCE_CONFIDENCE_KEYWORDS: readonly ["defined", "common_fact", "strong_assumption", "rough_assumption", "unsupported_assumption", "unlikely_assumption", "likely_refuted", "refuted"];
export declare const EDGE_CONFIDENCE_KEYWORDS: readonly ["exact_transform", "reliable_inference", "strong_inference", "approximate_inference", "unsupported_inference", "weak_inference", "likely_invalid", "invalid"];
export type SourceConfidenceKeyword = (typeof SOURCE_CONFIDENCE_KEYWORDS)[number];
export type EdgeConfidenceKeyword = (typeof EDGE_CONFIDENCE_KEYWORDS)[number];
export type ConfidenceKeyword = SourceConfidenceKeyword | EdgeConfidenceKeyword;
export interface RationalValue {
    readonly numerator: string;
    readonly denominator: string;
}
export interface ConfidenceAssessment {
    readonly lower: RationalValue;
    readonly estimate: RationalValue;
    readonly upper: RationalValue;
    readonly epistemicTag: ConfidenceEpistemicTag;
    readonly origin: ConfidenceOrigin;
    readonly profileId: string;
    readonly keywordId?: string;
}
export interface SerializedConfidenceAssessment {
    readonly lower: string;
    readonly estimate: string;
    readonly upper: string;
    readonly epistemic_tag: ConfidenceEpistemicTag;
    readonly origin: ConfidenceOrigin;
    readonly profile_id: string;
    readonly keyword_id?: string;
}
export type ConfidenceResultStatus = "computed" | "uncomputable";
export interface ConfidenceUnresolvedAggregationNode {
    readonly target_id: string;
    readonly parent_count: number;
}
export interface ConfidenceAggregation {
    readonly status: "unresolved_dependency";
    readonly baseline_method: "coordinate_min";
    readonly boost_applied: false;
    readonly boosted_estimate: null;
    readonly unresolved_nodes: readonly ConfidenceUnresolvedAggregationNode[];
}
export type DeclaredConfidenceRelation = "below_derived_interval" | "within_derived_interval" | "above_derived_interval";
export interface DeclaredConfidenceComparison {
    readonly relation: DeclaredConfidenceRelation;
}
export interface ConfidenceResult {
    readonly target_id: string;
    readonly node_kind: "source" | "derived";
    readonly status: ConfidenceResultStatus;
    readonly assessment?: SerializedConfidenceAssessment;
    readonly declared_assessment?: SerializedConfidenceAssessment;
    readonly declared_comparison?: DeclaredConfidenceComparison;
    readonly weakest_path?: readonly string[];
    readonly aggregation?: ConfidenceAggregation;
    readonly cause_ids: readonly string[];
    readonly reasons: readonly string[];
}
export declare class ConfidenceValueError extends Error {
    constructor(message: string);
}
export declare function createRationalValue(numerator: bigint, denominator: bigint): RationalValue;
export declare function parseUnitRational(value: string): RationalValue;
export declare function rationalToString(value: RationalValue): string;
export declare function compareRationalValues(left: RationalValue, right: RationalValue): number;
export declare function multiplyRationalValues(left: RationalValue, right: RationalValue): RationalValue;
export declare function minimumRationalValue(values: readonly RationalValue[]): RationalValue;
interface ConfidenceAssessmentInput {
    lower: RationalValue;
    estimate: RationalValue;
    upper: RationalValue;
    epistemicTag: ConfidenceEpistemicTag;
    origin: ConfidenceOrigin;
    profileId?: string;
    keywordId?: string;
}
export declare function createConfidenceAssessment(input: ConfidenceAssessmentInput): ConfidenceAssessment;
export declare function serializeConfidenceAssessment(assessment: ConfidenceAssessment): SerializedConfidenceAssessment;
export declare function multiplyConfidenceAssessments(left: ConfidenceAssessment, right: ConfidenceAssessment): ConfidenceAssessment;
export declare function weakestEpistemicTag(tags: readonly ConfidenceEpistemicTag[]): ConfidenceEpistemicTag;
export declare const DEFAULT_SOURCE_CONFIDENCE: ConfidenceAssessment;
export declare const DEFAULT_EDGE_CONFIDENCE: ConfidenceAssessment;
export declare function confidenceKeywordsFor(kind: ConfidenceKeywordKind): readonly ConfidenceKeyword[];
export declare function resolveConfidenceKeyword(kind: ConfidenceKeywordKind, keyword: string): ConfidenceAssessment;
export {};
