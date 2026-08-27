export const CONFIDENCE_PROFILE_ID = "support-trace-v1";
export const MAX_RATIONAL_DIGITS = 256;
export const SOURCE_CONFIDENCE_KEYWORDS = [
    "defined",
    "common_fact",
    "strong_assumption",
    "rough_assumption",
    "unsupported_assumption",
    "unlikely_assumption",
    "likely_refuted",
    "refuted",
];
export const EDGE_CONFIDENCE_KEYWORDS = [
    "exact_transform",
    "reliable_inference",
    "strong_inference",
    "approximate_inference",
    "unsupported_inference",
    "weak_inference",
    "likely_invalid",
    "invalid",
];
export class ConfidenceValueError extends Error {
    constructor(message) {
        super(message);
        this.name = "ConfidenceValueError";
    }
}
function absolute(value) {
    return value < 0n ? -value : value;
}
function greatestCommonDivisor(left, right) {
    let a = absolute(left);
    let b = absolute(right);
    while (b !== 0n) {
        const remainder = a % b;
        a = b;
        b = remainder;
    }
    return a === 0n ? 1n : a;
}
export function createRationalValue(numerator, denominator) {
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
function validateRationalDigits(value) {
    const digitCount = value.startsWith("-") ? value.length - 1 : value.length;
    if (digitCount > MAX_RATIONAL_DIGITS) {
        throw new ConfidenceValueError(`Rational component exceeds ${MAX_RATIONAL_DIGITS} digits`);
    }
}
export function parseUnitRational(value) {
    const match = /^(0|[1-9]\d*)\/(0|[1-9]\d*)$/.exec(value);
    if (!match) {
        throw new ConfidenceValueError(`Confidence value '${value}' must use non-negative numerator/denominator syntax`);
    }
    const numeratorText = match[1];
    const denominatorText = match[2];
    validateRationalDigits(numeratorText);
    validateRationalDigits(denominatorText);
    const numerator = BigInt(numeratorText);
    const denominator = BigInt(denominatorText);
    if (denominator === 0n) {
        throw new ConfidenceValueError("Confidence denominator must be positive");
    }
    if (numerator > denominator) {
        throw new ConfidenceValueError(`Confidence value '${value}' must be between 0/1 and 1/1`);
    }
    return createRationalValue(numerator, denominator);
}
export function rationalToString(value) {
    return `${value.numerator}/${value.denominator}`;
}
export function compareRationalValues(left, right) {
    const leftProduct = BigInt(left.numerator) * BigInt(right.denominator);
    const rightProduct = BigInt(right.numerator) * BigInt(left.denominator);
    if (leftProduct < rightProduct)
        return -1;
    if (leftProduct > rightProduct)
        return 1;
    return 0;
}
export function multiplyRationalValues(left, right) {
    return createRationalValue(BigInt(left.numerator) * BigInt(right.numerator), BigInt(left.denominator) * BigInt(right.denominator));
}
export function minimumRationalValue(values) {
    if (values.length === 0) {
        throw new ConfidenceValueError("Cannot take the minimum of no rationals");
    }
    return values
        .slice(1)
        .reduce((minimum, value) => compareRationalValues(value, minimum) < 0 ? value : minimum, values[0]);
}
const ZERO_CONFIDENCE = { numerator: "0", denominator: "1" };
const FULL_CONFIDENCE = { numerator: "1", denominator: "1" };
function validateConfidenceBounds(input) {
    if (compareRationalValues(input.lower, ZERO_CONFIDENCE) < 0 ||
        compareRationalValues(input.upper, FULL_CONFIDENCE) > 0) {
        throw new ConfidenceValueError("Confidence interval must stay within 0/1 and 1/1");
    }
}
function validateKnownConfidence(input) {
    if (compareRationalValues(input.lower, input.estimate) > 0 ||
        compareRationalValues(input.estimate, input.upper) > 0) {
        throw new ConfidenceValueError("Confidence interval must satisfy lower <= estimate <= upper");
    }
    if (input.epistemicTag === "known" &&
        (compareRationalValues(input.lower, input.estimate) !== 0 ||
            compareRationalValues(input.estimate, input.upper) !== 0)) {
        throw new ConfidenceValueError("Known confidence must use a point interval");
    }
}
function validateConfidenceKeywordOrigin(input) {
    if (input.origin === "keyword" && !input.keywordId) {
        throw new ConfidenceValueError("Keyword confidence must identify its profile keyword");
    }
    if (input.origin !== "keyword" && input.keywordId) {
        throw new ConfidenceValueError("Only keyword confidence may identify a profile keyword");
    }
    if (input.keywordId && !/^[A-Za-z][A-Za-z0-9_-]*$/.test(input.keywordId)) {
        throw new ConfidenceValueError(`Invalid confidence keyword identifier '${input.keywordId}'`);
    }
}
export function createConfidenceAssessment(input) {
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
export function serializeConfidenceAssessment(assessment) {
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
export function multiplyConfidenceAssessments(left, right) {
    return createConfidenceAssessment({
        lower: multiplyRationalValues(left.lower, right.lower),
        estimate: multiplyRationalValues(left.estimate, right.estimate),
        upper: multiplyRationalValues(left.upper, right.upper),
        epistemicTag: weakestEpistemicTag([left.epistemicTag, right.epistemicTag]),
        origin: "derived",
        profileId: CONFIDENCE_PROFILE_ID,
    });
}
export function weakestEpistemicTag(tags) {
    if (tags.includes("unknown"))
        return "unknown";
    if (tags.includes("estimated"))
        return "estimated";
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
const SOURCE_CONFIDENCE_KEYWORD_DEFINITIONS = {
    defined: pointKeyword("1/1", "known"),
    common_fact: intervalKeyword("49/50", "99/100", "1/1"),
    strong_assumption: intervalKeyword("17/20", "9/10", "19/20"),
    rough_assumption: intervalKeyword("7/10", "4/5", "9/10"),
    unsupported_assumption: intervalKeyword("1/4", "1/2", "3/4", "unknown"),
    unlikely_assumption: intervalKeyword("1/10", "1/4", "1/2"),
    likely_refuted: intervalKeyword("1/20", "1/8", "1/4"),
    refuted: intervalKeyword("0/1", "1/100", "1/50"),
};
const EDGE_CONFIDENCE_KEYWORD_DEFINITIONS = {
    exact_transform: pointKeyword("1/1", "known"),
    reliable_inference: intervalKeyword("49/50", "99/100", "1/1"),
    strong_inference: intervalKeyword("17/20", "9/10", "19/20"),
    approximate_inference: intervalKeyword("7/10", "4/5", "9/10"),
    unsupported_inference: intervalKeyword("1/4", "1/2", "3/4", "unknown"),
    weak_inference: intervalKeyword("1/10", "1/4", "1/2"),
    likely_invalid: intervalKeyword("1/20", "1/8", "1/4"),
    invalid: intervalKeyword("0/1", "1/100", "1/50"),
};
function pointKeyword(value, epistemicTag) {
    return { lower: value, estimate: value, upper: value, epistemicTag };
}
function intervalKeyword(lower, estimate, upper, epistemicTag = "estimated") {
    return { lower, estimate, upper, epistemicTag };
}
export function confidenceKeywordsFor(kind) {
    return kind === "source"
        ? SOURCE_CONFIDENCE_KEYWORDS
        : EDGE_CONFIDENCE_KEYWORDS;
}
export function resolveConfidenceKeyword(kind, keyword) {
    const definitions = kind === "source"
        ? SOURCE_CONFIDENCE_KEYWORD_DEFINITIONS
        : EDGE_CONFIDENCE_KEYWORD_DEFINITIONS;
    const definition = definitions[keyword];
    if (!definition) {
        throw new ConfidenceValueError(`Unknown ${kind} confidence keyword '${keyword}' in profile '${CONFIDENCE_PROFILE_ID}'; expected one of: ${confidenceKeywordsFor(kind).join(", ")}`);
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
//# sourceMappingURL=confidence.js.map