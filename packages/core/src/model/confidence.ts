export const CONFIDENCE_PROFILE_ID = "support-trace-v1";
export const MAX_RATIONAL_DIGITS = 256;

export type ConfidenceEpistemicTag = "known" | "estimated" | "unknown";
export type ConfidenceOrigin = "explicit" | "keyword" | "default" | "derived";
export type ConfidenceKeywordKind = "source" | "edge";

export const SOURCE_CONFIDENCE_KEYWORDS = [
  "defined",
  "common_fact",
  "strong_assumption",
  "rough_assumption",
  "unsupported_assumption",
  "unlikely_assumption",
  "likely_refuted",
  "refuted",
] as const;

export const EDGE_CONFIDENCE_KEYWORDS = [
  "exact_transform",
  "reliable_inference",
  "strong_inference",
  "approximate_inference",
  "unsupported_inference",
  "weak_inference",
  "likely_invalid",
  "invalid",
] as const;

export type SourceConfidenceKeyword =
  (typeof SOURCE_CONFIDENCE_KEYWORDS)[number];
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

export type DeclaredConfidenceRelation =
  | "below_derived_interval"
  | "within_derived_interval"
  | "above_derived_interval";

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

export class ConfidenceValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfidenceValueError";
  }
}

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = absolute(left);
  let b = absolute(right);
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a === 0n ? 1n : a;
}

export function createRationalValue(
  numerator: bigint,
  denominator: bigint,
): RationalValue {
  if (denominator === 0n) {
    throw new ConfidenceValueError("Rational denominator must not be zero");
  }
  const sign = denominator < 0n ? -1n : 1n;
  const signedNumerator = numerator * sign;
  const positiveDenominator = denominator * sign;
  const divisor = greatestCommonDivisor(signedNumerator, positiveDenominator);
  const normalizedNumerator = (signedNumerator / divisor).toString();
  const normalizedDenominator = (positiveDenominator / divisor).toString();
  validateRationalDigits(normalizedNumerator);
  validateRationalDigits(normalizedDenominator);
  return {
    numerator: normalizedNumerator,
    denominator: normalizedDenominator,
  };
}

function validateRationalDigits(value: string): void {
  const digitCount = value.startsWith("-") ? value.length - 1 : value.length;
  if (digitCount > MAX_RATIONAL_DIGITS) {
    throw new ConfidenceValueError(
      `Rational component exceeds ${MAX_RATIONAL_DIGITS} digits`,
    );
  }
}

export function parseUnitRational(value: string): RationalValue {
  const match = /^(0|[1-9]\d*)\/(0|[1-9]\d*)$/.exec(value);
  if (!match) {
    throw new ConfidenceValueError(
      `Confidence value '${value}' must use non-negative numerator/denominator syntax`,
    );
  }
  const numeratorText = match[1]!;
  const denominatorText = match[2]!;
  validateRationalDigits(numeratorText);
  validateRationalDigits(denominatorText);
  const numerator = BigInt(numeratorText);
  const denominator = BigInt(denominatorText);
  if (denominator === 0n) {
    throw new ConfidenceValueError("Confidence denominator must be positive");
  }
  if (numerator > denominator) {
    throw new ConfidenceValueError(
      `Confidence value '${value}' must be between 0/1 and 1/1`,
    );
  }
  return createRationalValue(numerator, denominator);
}

export function rationalToString(value: RationalValue): string {
  return `${value.numerator}/${value.denominator}`;
}

export function compareRationalValues(
  left: RationalValue,
  right: RationalValue,
): number {
  const leftProduct = BigInt(left.numerator) * BigInt(right.denominator);
  const rightProduct = BigInt(right.numerator) * BigInt(left.denominator);
  if (leftProduct < rightProduct) return -1;
  if (leftProduct > rightProduct) return 1;
  return 0;
}

export function multiplyRationalValues(
  left: RationalValue,
  right: RationalValue,
): RationalValue {
  return createRationalValue(
    BigInt(left.numerator) * BigInt(right.numerator),
    BigInt(left.denominator) * BigInt(right.denominator),
  );
}

export function minimumRationalValue(
  values: readonly RationalValue[],
): RationalValue {
  if (values.length === 0) {
    throw new ConfidenceValueError("Cannot take the minimum of no rationals");
  }
  return values
    .slice(1)
    .reduce(
      (minimum, value) =>
        compareRationalValues(value, minimum) < 0 ? value : minimum,
      values[0]!,
    );
}

const ZERO_CONFIDENCE: RationalValue = { numerator: "0", denominator: "1" };
const FULL_CONFIDENCE: RationalValue = { numerator: "1", denominator: "1" };

interface ConfidenceAssessmentInput {
  lower: RationalValue;
  estimate: RationalValue;
  upper: RationalValue;
  epistemicTag: ConfidenceEpistemicTag;
  origin: ConfidenceOrigin;
  profileId?: string;
  keywordId?: string;
}

function validateConfidenceBounds(input: ConfidenceAssessmentInput): void {
  if (
    compareRationalValues(input.lower, ZERO_CONFIDENCE) < 0 ||
    compareRationalValues(input.upper, FULL_CONFIDENCE) > 0
  ) {
    throw new ConfidenceValueError(
      "Confidence interval must stay within 0/1 and 1/1",
    );
  }
}

function validateKnownConfidence(input: ConfidenceAssessmentInput): void {
  if (
    compareRationalValues(input.lower, input.estimate) > 0 ||
    compareRationalValues(input.estimate, input.upper) > 0
  ) {
    throw new ConfidenceValueError(
      "Confidence interval must satisfy lower <= estimate <= upper",
    );
  }
  if (
    input.epistemicTag === "known" &&
    (compareRationalValues(input.lower, input.estimate) !== 0 ||
      compareRationalValues(input.estimate, input.upper) !== 0)
  ) {
    throw new ConfidenceValueError(
      "Known confidence must use a point interval",
    );
  }
}

function validateConfidenceKeywordOrigin(
  input: ConfidenceAssessmentInput,
): void {
  if (input.origin === "keyword" && !input.keywordId) {
    throw new ConfidenceValueError(
      "Keyword confidence must identify its profile keyword",
    );
  }
  if (input.origin !== "keyword" && input.keywordId) {
    throw new ConfidenceValueError(
      "Only keyword confidence may identify a profile keyword",
    );
  }
  if (input.keywordId && !/^[A-Za-z][A-Za-z0-9_-]*$/.test(input.keywordId)) {
    throw new ConfidenceValueError(
      `Invalid confidence keyword identifier '${input.keywordId}'`,
    );
  }
}

export function createConfidenceAssessment(
  input: ConfidenceAssessmentInput,
): ConfidenceAssessment {
  validateConfidenceBounds(input);
  validateKnownConfidence(input);
  validateConfidenceKeywordOrigin(input);
  return {
    lower: input.lower,
    estimate: input.estimate,
    upper: input.upper,
    epistemicTag: input.epistemicTag,
    origin: input.origin,
    profileId: input.profileId ?? CONFIDENCE_PROFILE_ID,
    ...(input.keywordId ? { keywordId: input.keywordId } : {}),
  };
}

export function serializeConfidenceAssessment(
  assessment: ConfidenceAssessment,
): SerializedConfidenceAssessment {
  return {
    lower: rationalToString(assessment.lower),
    estimate: rationalToString(assessment.estimate),
    upper: rationalToString(assessment.upper),
    epistemic_tag: assessment.epistemicTag,
    origin: assessment.origin,
    profile_id: assessment.profileId,
    ...(assessment.keywordId ? { keyword_id: assessment.keywordId } : {}),
  };
}

export function multiplyConfidenceAssessments(
  left: ConfidenceAssessment,
  right: ConfidenceAssessment,
): ConfidenceAssessment {
  return createConfidenceAssessment({
    lower: multiplyRationalValues(left.lower, right.lower),
    estimate: multiplyRationalValues(left.estimate, right.estimate),
    upper: multiplyRationalValues(left.upper, right.upper),
    epistemicTag: weakestEpistemicTag([left.epistemicTag, right.epistemicTag]),
    origin: "derived",
    profileId: CONFIDENCE_PROFILE_ID,
  });
}

export function weakestEpistemicTag(
  tags: readonly ConfidenceEpistemicTag[],
): ConfidenceEpistemicTag {
  if (tags.includes("unknown")) return "unknown";
  if (tags.includes("estimated")) return "estimated";
  return "known";
}

export const DEFAULT_SOURCE_CONFIDENCE = createConfidenceAssessment({
  lower: parseUnitRational("1/4"),
  estimate: parseUnitRational("1/2"),
  upper: parseUnitRational("3/4"),
  epistemicTag: "unknown",
  origin: "default",
});

export const DEFAULT_EDGE_CONFIDENCE = createConfidenceAssessment({
  lower: parseUnitRational("9/10"),
  estimate: parseUnitRational("19/20"),
  upper: parseUnitRational("1/1"),
  epistemicTag: "unknown",
  origin: "default",
});

interface ConfidenceKeywordDefinition {
  readonly lower: string;
  readonly estimate: string;
  readonly upper: string;
  readonly epistemicTag: ConfidenceEpistemicTag;
}

const SOURCE_CONFIDENCE_KEYWORD_DEFINITIONS: Readonly<
  Record<SourceConfidenceKeyword, ConfidenceKeywordDefinition>
> = {
  defined: pointKeyword("1/1", "known"),
  common_fact: intervalKeyword("49/50", "99/100", "1/1"),
  strong_assumption: intervalKeyword("17/20", "9/10", "19/20"),
  rough_assumption: intervalKeyword("7/10", "4/5", "9/10"),
  unsupported_assumption: intervalKeyword("1/4", "1/2", "3/4", "unknown"),
  unlikely_assumption: intervalKeyword("1/10", "1/4", "1/2"),
  likely_refuted: intervalKeyword("1/20", "1/8", "1/4"),
  refuted: intervalKeyword("0/1", "1/100", "1/50"),
};

const EDGE_CONFIDENCE_KEYWORD_DEFINITIONS: Readonly<
  Record<EdgeConfidenceKeyword, ConfidenceKeywordDefinition>
> = {
  exact_transform: pointKeyword("1/1", "known"),
  reliable_inference: intervalKeyword("49/50", "99/100", "1/1"),
  strong_inference: intervalKeyword("17/20", "9/10", "19/20"),
  approximate_inference: intervalKeyword("7/10", "4/5", "9/10"),
  unsupported_inference: intervalKeyword("1/4", "1/2", "3/4", "unknown"),
  weak_inference: intervalKeyword("1/10", "1/4", "1/2"),
  likely_invalid: intervalKeyword("1/20", "1/8", "1/4"),
  invalid: intervalKeyword("0/1", "1/100", "1/50"),
};

function pointKeyword(
  value: string,
  epistemicTag: ConfidenceEpistemicTag,
): ConfidenceKeywordDefinition {
  return { lower: value, estimate: value, upper: value, epistemicTag };
}

function intervalKeyword(
  lower: string,
  estimate: string,
  upper: string,
  epistemicTag: ConfidenceEpistemicTag = "estimated",
): ConfidenceKeywordDefinition {
  return { lower, estimate, upper, epistemicTag };
}

export function confidenceKeywordsFor(
  kind: ConfidenceKeywordKind,
): readonly ConfidenceKeyword[] {
  return kind === "source"
    ? SOURCE_CONFIDENCE_KEYWORDS
    : EDGE_CONFIDENCE_KEYWORDS;
}

export function resolveConfidenceKeyword(
  kind: ConfidenceKeywordKind,
  keyword: string,
): ConfidenceAssessment {
  const definitions: Readonly<Record<string, ConfidenceKeywordDefinition>> =
    kind === "source"
      ? SOURCE_CONFIDENCE_KEYWORD_DEFINITIONS
      : EDGE_CONFIDENCE_KEYWORD_DEFINITIONS;
  const definition = definitions[keyword];
  if (!definition) {
    throw new ConfidenceValueError(
      `Unknown ${kind} confidence keyword '${keyword}' in profile '${CONFIDENCE_PROFILE_ID}'; expected one of: ${confidenceKeywordsFor(kind).join(", ")}`,
    );
  }
  return createConfidenceAssessment({
    lower: parseUnitRational(definition.lower),
    estimate: parseUnitRational(definition.estimate),
    upper: parseUnitRational(definition.upper),
    epistemicTag: definition.epistemicTag,
    origin: "keyword",
    profileId: CONFIDENCE_PROFILE_ID,
    keywordId: keyword,
  });
}
