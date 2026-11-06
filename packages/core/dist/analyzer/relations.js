export function relationFinding(id, rule, message, severity, span, extra = {}) {
    return {
        category: severity === "warning" || severity === "info"
            ? "semantic_hint"
            : "contract_violation",
        severity,
        target_refs: [{ ref_id: id }],
        message,
        metadata: { rule_id: rule, line: span.line, column: span.column, ...extra },
    };
}
function validateRelation(decision, relation, ids) {
    const findings = [];
    const add = (rule, text, severity = "error") => findings.push(relationFinding(decision.id, rule, text, severity, relation.span));
    const refs = relation.family === "based_on" ? decision.basedOn : (decision.actsOn ?? []);
    if (!refs.includes(relation.targetId))
        add("REL002", "relation の対象が対応するヘッダー参照にない。");
    const permitted = relation.family === "based_on"
        ? ["support", "causal"]
        : ["intervention", "mitigation", "recovery"];
    if (!permitted.includes(relation.kind))
        add("REL003", "relation kind が参照の所属と整合しない。");
    for (const ref of relation.evidence ?? []) {
        if (!ids.has(ref))
            findings.push(relationFinding(decision.id, "REL001", `関係の根拠 ${ref} を解決できない。`, "fatal", relation.evidenceSpan ?? relation.span, { unresolved_ref: ref }));
    }
    return findings;
}
export function auditRelations(document) {
    const ids = new Set([
        ...document.problems.map((p) => p.name),
        ...document.steps.map((s) => s.statement.id),
    ]);
    const findings = [];
    for (const { statement } of document.steps) {
        if (statement.role !== "decision")
            continue;
        for (const [index, ref] of (statement.actsOn ?? []).entries()) {
            if (!ids.has(ref))
                findings.push(relationFinding(statement.id, "REL001", `作用対象 ${ref} を解決できない。`, "fatal", statement.actsOnSpans?.[index] ?? statement.span, { unresolved_ref: ref }));
        }
        const seen = new Set();
        for (const relation of statement.relations ?? []) {
            const key = `${relation.family}:${relation.targetId}`;
            if (seen.has(key))
                findings.push(relationFinding(statement.id, "REL004", "同じ参照関係の詳細が重複している。", "error", relation.span));
            seen.add(key);
            findings.push(...validateRelation(statement, relation, ids));
        }
    }
    return findings;
}
//# sourceMappingURL=relations.js.map