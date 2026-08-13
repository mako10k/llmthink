import { cosineSimilarity, embedTexts, } from "../semantic/embeddings.js";
import { visitDslqlAst, } from "./ast.js";
import { DslqlEvaluationError, evaluateDslqlExpression, } from "./evaluator.js";
import { parseDslqlExpression } from "./parser.js";
import { createDocumentDslqlRuntime, } from "./runtime.js";
export class DslqlSemanticError extends DslqlEvaluationError {
    constructor(message, range) {
        super(message, range);
        this.name = "DslqlSemanticError";
    }
}
export class DslqlSemanticUnavailableError extends DslqlSemanticError {
    constructor(message) {
        super(message);
        this.name = "DslqlSemanticUnavailableError";
    }
}
const SEMANTIC_FUNCTIONS = new Set(["similarity", "similar_to", "nearest_to"]);
export const DEFAULT_DSLQL_ON_DEMAND_EMBEDDING_LIMIT = 8;
function asObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? value
        : undefined;
}
function appendStringField(parts, value, field) {
    const candidate = value[field];
    if (typeof candidate === "string" && candidate.trim()) {
        parts.push(candidate.trim());
    }
}
function semanticText(value, visited = new WeakSet()) {
    if (visited.has(value))
        return undefined;
    visited.add(value);
    const parts = [];
    for (const field of [
        "text",
        "description",
        "excerpt",
        "message",
        "rationale",
        "suggestion",
        "summary",
        "expression",
        "axis",
        "predicate",
        "value",
    ]) {
        appendStringField(parts, value, field);
    }
    for (const field of ["statement", "rules", "members", "annotations"]) {
        const nested = value[field];
        const nestedValues = Array.isArray(nested) ? nested : [nested];
        for (const candidate of nestedValues) {
            const object = candidate === undefined ? undefined : asObject(candidate);
            const text = object ? semanticText(object, visited) : undefined;
            if (text)
                parts.push(text);
        }
    }
    const unique = [...new Set(parts)];
    return unique.length > 0 ? unique.join("\n") : undefined;
}
function collectSemanticCandidates(root, selectText) {
    const visited = new WeakSet();
    const candidates = [];
    function collect(value) {
        if (Array.isArray(value)) {
            value.forEach(collect);
            return;
        }
        const object = asObject(value);
        if (!object || visited.has(object))
            return;
        visited.add(object);
        const text = selectText(object)?.trim();
        if (text)
            candidates.push({ value: object, text });
        Object.values(object).forEach(collect);
    }
    collect(root);
    return candidates;
}
function targetFromOperand(operand) {
    if (operand.kind === "reference") {
        return {
            key: `reference:${operand.id}`,
            referenceId: operand.id,
            range: operand.range,
        };
    }
    if (operand.kind === "literal" &&
        typeof operand.value === "string" &&
        operand.value.trim()) {
        return {
            key: `text:${operand.value}`,
            text: operand.value,
            range: operand.range,
        };
    }
    if (operand.kind === "path" &&
        operand.origin === "current" &&
        operand.segments.length === 0) {
        return undefined;
    }
    throw new DslqlSemanticError("Semantic operands must be the current object '.', an @ID reference, or a non-empty string literal; dynamic construction is not supported", operand.range);
}
function validateThreshold(expression, index) {
    const threshold = expression.arguments[index];
    if (!threshold)
        return;
    if (threshold.kind !== "literal" ||
        typeof threshold.value !== "number" ||
        threshold.value < 0 ||
        threshold.value > 1) {
        throw new DslqlSemanticError(`${expression.name}() threshold must be a number literal from 0 through 1`, threshold.range);
    }
}
function validateSemanticCall(expression) {
    let operands;
    if (expression.name === "similarity") {
        if (expression.arguments.length !== 2) {
            throw new DslqlSemanticError(`similarity() expects 2 argument(s); received ${expression.arguments.length}`, expression.range);
        }
        operands = expression.arguments;
    }
    else if (expression.name === "similar_to") {
        if (expression.arguments.length !== 3) {
            throw new DslqlSemanticError(`similar_to() expects 3 argument(s); received ${expression.arguments.length}`, expression.range);
        }
        validateThreshold(expression, 2);
        operands = expression.arguments.slice(0, 2);
    }
    else {
        if (expression.arguments.length < 1 || expression.arguments.length > 2) {
            throw new DslqlSemanticError(`nearest_to() expects 1..2 argument(s); received ${expression.arguments.length}`, expression.range);
        }
        validateThreshold(expression, 1);
        operands = expression.arguments.slice(0, 1);
        if (operands[0]?.kind === "path") {
            throw new DslqlSemanticError("nearest_to() target must be an @ID reference or a non-empty string literal", operands[0].range);
        }
    }
    operands.forEach(targetFromOperand);
    return operands;
}
function collectSemanticTargets(expression) {
    const targets = new Map();
    visitDslqlAst(expression, (node) => {
        if (node.kind !== "call" || !SEMANTIC_FUNCTIONS.has(node.name))
            return;
        for (const operand of validateSemanticCall(node)) {
            const target = targetFromOperand(operand);
            if (target)
                targets.set(target.key, target);
        }
    });
    return [...targets.values()];
}
function validateOnDemandEmbeddingBudget(targets, options) {
    const limit = options.maxOnDemandEmbeddings ?? DEFAULT_DSLQL_ON_DEMAND_EMBEDDING_LIMIT;
    if (!Number.isSafeInteger(limit) || limit < 0) {
        throw new DslqlSemanticError("maxOnDemandEmbeddings must be a non-negative safe integer");
    }
    const demanded = new Set(targets
        .filter((target) => target.text !== undefined)
        .map((target) => target.text)).size;
    if (demanded > limit) {
        throw new DslqlSemanticError(`Semantic query requires ${demanded} distinct on-demand embeddings; configured limit is ${limit}`);
    }
}
export function usesSemanticDslql(expression) {
    const ast = typeof expression === "string"
        ? parseDslqlExpression(expression)
        : expression;
    let found = false;
    visitDslqlAst(ast, (node) => {
        if (node.kind === "call" && SEMANTIC_FUNCTIONS.has(node.name))
            found = true;
    });
    return found;
}
function needsObjectEmbeddings(expression) {
    let needed = false;
    visitDslqlAst(expression, (node) => {
        if (node.kind !== "call" || !SEMANTIC_FUNCTIONS.has(node.name))
            return;
        if (node.name === "nearest_to") {
            needed = true;
            return;
        }
        const operandCount = node.name === "similar_to" ? 2 : node.arguments.length;
        if (node.arguments
            .slice(0, operandCount)
            .some((operand) => operand.kind === "path")) {
            needed = true;
        }
    });
    return needed;
}
function validateEmbeddingResult(result, expectedCount) {
    const dimensions = result.embeddings[0]?.length ?? 0;
    const invalid = !result.provider.trim() ||
        !result.model.trim() ||
        result.embeddings.length !== expectedCount ||
        dimensions === 0 ||
        result.embeddings.some((embedding) => embedding.length !== dimensions ||
            embedding.some((component) => !Number.isFinite(component)));
    if (invalid) {
        throw new DslqlSemanticUnavailableError("Embedding provider returned an invalid vector batch");
    }
}
function roundSimilarity(value) {
    const normalized = Number.isFinite(value)
        ? Math.max(0, Math.min(1, value))
        : 0;
    return Number(normalized.toFixed(4));
}
function vectorForStaticOperand(operand, targetVectors) {
    const target = targetFromOperand(operand);
    return target ? targetVectors.get(target.key) : undefined;
}
function vectorForObject(value, vectorByValue) {
    const object = asObject(value);
    if (!object)
        return undefined;
    return vectorByValue.get(object);
}
function resolveSemanticOperand(operand, item, context, vectorByValue, targetVectors) {
    const staticVector = vectorForStaticOperand(operand, targetVectors);
    if (staticVector)
        return staticVector;
    const values = context.evaluate(operand, [item]);
    if (values.length !== 1) {
        throw new DslqlSemanticError(`Semantic operand must produce exactly one object; received ${values.length}`, operand.range);
    }
    const vector = vectorForObject(values[0], vectorByValue);
    if (!vector) {
        throw new DslqlSemanticError("Semantic operand must be an embedded object; only string literals may be embedded on demand", operand.range);
    }
    return vector;
}
function createSimilarityFunction(vectorByValue, targetVectors) {
    return (context) => context.input.map((item) => {
        const left = resolveSemanticOperand(context.arguments[0], item, context, vectorByValue, targetVectors);
        const right = resolveSemanticOperand(context.arguments[1], item, context, vectorByValue, targetVectors);
        return roundSimilarity(cosineSimilarity(left, right));
    });
}
function createSimilarToPredicateFunction(vectorByValue, targetVectors) {
    const similarity = createSimilarityFunction(vectorByValue, targetVectors);
    return (context) => {
        const thresholdExpression = context.arguments[2];
        const threshold = thresholdExpression.kind === "literal" &&
            typeof thresholdExpression.value === "number"
            ? thresholdExpression.value
            : Number.NaN;
        return similarity(context).map((score) => Number(score) >= threshold);
    };
}
function createNearestToFunction(vectorByValue, targetVectors, provider, model) {
    return (context) => {
        const call = {
            kind: "call",
            name: "nearest_to",
            arguments: [...context.arguments],
            range: context.arguments[0]?.range ?? {
                start: { offset: 0, line: 1, column: 1 },
                end: { offset: 0, line: 1, column: 1 },
            },
        };
        validateSemanticCall(call);
        const target = targetFromOperand(call.arguments[0]);
        const thresholdExpression = context.arguments[1];
        const threshold = thresholdExpression?.kind === "literal" &&
            typeof thresholdExpression.value === "number"
            ? thresholdExpression.value
            : 0;
        const targetVector = targetVectors.get(target.key);
        if (!targetVector) {
            throw new DslqlSemanticError(`Semantic target '${target.referenceId ?? target.text ?? target.key}' was not prepared`, target.range);
        }
        return context.input
            .map((value, position) => {
            const object = asObject(value);
            const nestedNode = object ? asObject(object.node) : undefined;
            const directVector = object ? vectorByValue.get(object) : undefined;
            const nestedVector = nestedNode
                ? vectorByValue.get(nestedNode)
                : undefined;
            const vector = directVector ?? nestedVector;
            const node = directVector ? value : nestedNode;
            if (!node || !vector) {
                throw new DslqlSemanticError("nearest_to() input must be a semantic node from the prepared runtime");
            }
            const score = roundSimilarity(cosineSimilarity(targetVector, vector));
            return {
                position,
                score,
                value: {
                    node,
                    score,
                    provider,
                    model,
                },
            };
        })
            .filter((match) => match.score >= threshold)
            .sort((left, right) => right.score - left.score || left.position - right.position)
            .map((match) => match.value);
    };
}
async function prepareEmbeddings(texts, options) {
    let result;
    try {
        result = options.embedder
            ? await options.embedder(texts)
            : await embedTexts(texts, options.embeddings);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new DslqlSemanticUnavailableError(`Embedding preparation failed: ${message}`);
    }
    if (!result) {
        throw new DslqlSemanticUnavailableError("Embedding provider is disabled; semantic DSLQL requires an embedding provider");
    }
    validateEmbeddingResult(result, texts.length);
    return result;
}
export async function createSemanticDslqlRuntime(runtime, expression, options = {}) {
    const ast = typeof expression === "string"
        ? parseDslqlExpression(expression)
        : expression;
    const targets = collectSemanticTargets(ast);
    const objectEmbeddingsNeeded = needsObjectEmbeddings(ast);
    if (targets.length === 0 && !objectEmbeddingsNeeded)
        return runtime;
    validateOnDemandEmbeddingBudget(targets, options);
    const candidates = collectSemanticCandidates(runtime.root, options.selectText ?? semanticText);
    const candidateById = new Map();
    for (const candidate of candidates) {
        const id = candidate.value.id;
        if (typeof id === "string")
            candidateById.set(id, candidate);
    }
    for (const target of targets) {
        if (target.referenceId && !candidateById.has(target.referenceId)) {
            throw new DslqlSemanticError(`Semantic reference '${target.referenceId}' has no text-bearing node`, target.range);
        }
    }
    const texts = new Set();
    if (objectEmbeddingsNeeded) {
        candidates.forEach((candidate) => texts.add(candidate.text));
    }
    targets.forEach((target) => {
        const text = target.referenceId
            ? candidateById.get(target.referenceId)?.text
            : target.text;
        if (text !== undefined)
            texts.add(text);
    });
    const uniqueTexts = [...texts];
    const result = await prepareEmbeddings(uniqueTexts, options);
    const vectorByText = new Map(uniqueTexts.map((text, index) => [text, result.embeddings[index]]));
    const vectorByValue = new WeakMap();
    candidates.forEach((candidate) => {
        const vector = vectorByText.get(candidate.text);
        if (vector)
            vectorByValue.set(candidate.value, vector);
    });
    const targetVectors = new Map();
    targets.forEach((target) => {
        const text = target.referenceId
            ? candidateById.get(target.referenceId).text
            : target.text;
        targetVectors.set(target.key, vectorByText.get(text));
    });
    return {
        ...runtime,
        functions: {
            ...runtime.functions,
            similarity: createSimilarityFunction(vectorByValue, targetVectors),
            similar_to: createSimilarToPredicateFunction(vectorByValue, targetVectors),
            nearest_to: createNearestToFunction(vectorByValue, targetVectors, result.provider, result.model),
        },
    };
}
export async function createSemanticDocumentDslqlRuntime(documentAst, expression, options = {}) {
    return createSemanticDslqlRuntime(createDocumentDslqlRuntime(documentAst, options), expression, options);
}
export async function evaluateSemanticDslqlExpression(expression, runtime, options = {}) {
    const ast = typeof expression === "string"
        ? parseDslqlExpression(expression)
        : expression;
    const semanticRuntime = await createSemanticDslqlRuntime(runtime, ast, options);
    return evaluateDslqlExpression(ast, semanticRuntime);
}
export async function evaluateSemanticDocumentDslqlExpression(expression, documentAst, options = {}) {
    return evaluateSemanticDslqlExpression(expression, createDocumentDslqlRuntime(documentAst, options), options);
}
//# sourceMappingURL=semantic.js.map