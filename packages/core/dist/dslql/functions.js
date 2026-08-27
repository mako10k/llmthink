function spec(name, category, minimum, maximum, operands, result, summary) {
    return {
        name,
        category,
        arity: { minimum, maximum },
        operands,
        result,
        semantic: category === "semantic",
        summary,
    };
}
export const DSLQL_FUNCTION_SPECS = [
    spec("select", "core", 1, 1, ["predicate"], "filtered stream", "条件が真の input 値だけを順序を保って返します。"),
    spec("map", "core", 1, 1, ["projection"], "projected stream", "input の各値へ式を適用し、得られた値 stream を返します。"),
    spec("sort_by", "core", 1, 1, ["selector"], "sorted stream", "selector の string または number 値で安定昇順に並べます。"),
    spec("unique_by", "core", 0, 1, ["selector?"], "unique stream", "値または selector の結果が最初に現れた要素だけを返します。"),
    spec("limit", "core", 1, 1, ["count"], "bounded stream", "非負 safe integer で input stream の先頭件数を制限します。"),
    spec("len", "core", 0, 1, ["value?"], "number stream", "string、array、object の長さを返します。引数省略時は input 値を測ります。"),
    spec("contains", "core", 1, 1, ["needle"], "boolean stream", "string の部分一致または array の値包含を判定します。"),
    spec("starts_with", "core", 1, 1, ["prefix"], "boolean stream", "input string が prefix で始まるか判定します。"),
    spec("ends_with", "core", 1, 1, ["suffix"], "boolean stream", "input string が suffix で終わるか判定します。"),
    spec("kind", "core", 0, 0, [], "string stream", "各 input 値の正規化後 kind 名を返します。"),
    spec("related_decisions", "relation", 0, 0, [], "decision node stream", "input node から上流参照を持つ decision を文書順で返します。"),
    spec("based_on_refs", "relation", 0, 0, [], "referenced node stream", "input decision の based_on が直接参照する node を返します。"),
    spec("upstream", "relation", 0, 0, [], "node stream", "input ID から参照 graph の上流 node を幅優先で返します。"),
    spec("downstream", "relation", 0, 0, [], "node stream", "input ID を参照する下流 node を幅優先で返します。"),
    spec("audit_findings", "context", 0, 1, ["minimum-severity?"], "audit finding stream", "audit result から finding を取り出し、任意の最低 severity で絞ります。"),
    spec("has_open_pending", "context", 0, 0, [], "boolean stream", "input 構造に pending statement が含まれるか判定します。"),
    spec("score", "context", 0, 0, [], "number stream", "各 input object の numeric score field を返します。"),
    spec("similarity", "semantic", 2, 2, ["a", "b"], "number stream", "2 つの意味オブジェクトの embedding 類似度を 0..1 で返します。"),
    spec("similar_to", "semantic", 3, 3, ["a", "b", "threshold"], "boolean stream", "2 つの意味オブジェクトの類似度が必須 threshold 以上か返します。"),
    spec("nearest_to", "semantic", 1, 2, ["@ID|string-literal", "threshold?"], "semantic match stream", "候補を target との類似度で降順にし、node、score、provider、model を返します。"),
];
const FUNCTION_SPEC_BY_NAME = new Map(DSLQL_FUNCTION_SPECS.map((entry) => [entry.name, entry]));
export function getDslqlFunctionSpec(name) {
    return FUNCTION_SPEC_BY_NAME.get(name);
}
export function listDslqlFunctionSpecs(categories) {
    if (!categories)
        return [...DSLQL_FUNCTION_SPECS];
    const selected = new Set(categories);
    return DSLQL_FUNCTION_SPECS.filter((entry) => selected.has(entry.category));
}
export function acceptsDslqlFunctionArity(functionSpec, count) {
    return (count >= functionSpec.arity.minimum && count <= functionSpec.arity.maximum);
}
export function formatDslqlFunctionArity(functionSpec) {
    const { minimum, maximum } = functionSpec.arity;
    return minimum === maximum ? String(minimum) : `${minimum}..${maximum}`;
}
export function assertDslqlFunctionImplementationCoverage(categories, implementedNames) {
    const expected = listDslqlFunctionSpecs(categories).map((entry) => entry.name);
    const implemented = [...new Set(implementedNames)];
    const missing = expected.filter((name) => !implemented.includes(name));
    const unexpected = implemented.filter((name) => !expected.includes(name));
    if (missing.length > 0 || unexpected.length > 0) {
        throw new Error(`DSLQL function registry mismatch: missing=[${missing.join(", ")}] unexpected=[${unexpected.join(", ")}]`);
    }
}
//# sourceMappingURL=functions.js.map