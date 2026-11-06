import { relationFinding } from "./relations.js";
const PROFILE = "causal-impact-v1";
const ROLES = new Set([
    "phenomenon",
    "cause",
    "impact",
    "measure",
    "cause_unknown",
]);
function roleOf(node) {
    return node && "annotations" in node
        ? node.annotations.find((a) => a.kind === "role")?.text
        : undefined;
}
function hasNote(node, kinds) {
    return ("annotations" in node &&
        node.annotations.some((a) => kinds.includes(a.kind) && a.text.trim().length > 0));
}
function reachable(starts, edges) {
    const visited = new Set(starts), queue = [...visited];
    for (let index = 0; index < queue.length; index++) {
        const current = queue[index];
        for (const next of edges.get(current) ?? []) {
            if (visited.has(next))
                continue;
            visited.add(next);
            queue.push(next);
        }
    }
    return visited;
}
function link(edges, from, to) {
    const targets = edges.get(from) ?? new Set();
    targets.add(to);
    edges.set(from, targets);
}
function add(ctx, node, rule, message, severity = "warning", review = false) {
    ctx.findings.push(relationFinding(node.id, rule, message, severity, node.span, {
        profile_id: PROFILE,
        ...(review ? { review_required: true } : {}),
    }));
}
function auditRole(ctx, node) {
    if (!("annotations" in node))
        return;
    const roles = node.annotations.filter((a) => a.kind === "role");
    if (roles.length > 1 || roles.some((a) => !ROLES.has(a.text)))
        add(ctx, node, "CI001", "role は定義済みの役割を単一行で一つ指定する。", "error");
    if (roleOf(node) === "cause_unknown" && node.role !== "pending")
        add(ctx, node, "CI001", "cause_unknown は pending に付与する。", "error");
}
function collectRelation(ctx, node, relation) {
    if (relation.status === "confirmed" && !relation.evidence?.length)
        add(ctx, node, "CI002", "確認済み関係に、その関係を支持する evidence 参照がない。", "error");
    if (relation.status === "refuted")
        return;
    if (relation.family === "based_on" &&
        relation.kind === "causal" &&
        node.basedOn.includes(relation.targetId)) {
        link(ctx.causal, relation.targetId, node.id);
        link(ctx.reverseCausal, node.id, relation.targetId);
    }
    if (relation.family === "acts_on" && node.actsOn?.includes(relation.targetId))
        ctx.actedOn.add(relation.targetId);
}
function collectDecision(ctx, node) {
    for (const relation of node.relations ?? [])
        collectRelation(ctx, node, relation);
    for (const target of node.actsOn ?? []) {
        const detail = node.relations?.find((r) => r.family === "acts_on" && r.targetId === target);
        if (!detail?.mechanism?.trim())
            add(ctx, node, "CI003", "作用対象への関係詳細または作用機序がない。");
    }
}
function auditPhenomenon(ctx, node) {
    const unknown = node.role === "decision" &&
        node.basedOn.some((id) => roleOf(ctx.byId.get(id)) === "cause_unknown");
    if (!ctx.caused.has(node.id) && !unknown)
        add(ctx, node, "CI004", "現象に結び付いた原因候補または原因未確定の記録がない。");
}
function auditUnknown(ctx, node) {
    if (!hasNote(node, ["todo"])) {
        add(ctx, node, "CI005", "原因未確定: 調査内容・担当・再評価条件を todo に記録して確認する。", "warning", true);
    }
    else {
        add(ctx, node, "CI006", "原因未確定: 調査が原因候補を判別できるか、担当・再評価条件を確認する。", "warning", true);
    }
}
function auditImpactExploration(ctx, node) {
    if (!ctx.impactOrigins.has(node.id) &&
        !hasNote(node, ["rationale", "caveat"]))
        add(ctx, node, "CI007", "この起点からの影響連鎖、または影響未調査・該当なしの理由がない。");
}
function auditDisposition(ctx, node, cause) {
    if (ctx.actedOn.has(node.id) || hasNote(node, ["rationale", "todo"]))
        return;
    if (cause)
        add(ctx, node, "CI008", "原因候補への作用または調査・保留の方針がない。");
    else
        add(ctx, node, "CI009", "影響への作用または理由付きの保留がない。");
}
function auditMeasure(ctx, node) {
    if (node.role !== "decision" || !node.actsOn?.length)
        add(ctx, node, "CI010", "対策に acts_on がない。");
    add(ctx, node, "CI011", "対策の残存影響・副作用・検証・担当・再評価条件を確認する。仮説から効果の確定や既存影響の回復を推定しない。", "warning", true);
}
function auditNode(ctx, node) {
    switch (roleOf(node)) {
        case "phenomenon":
            auditPhenomenon(ctx, node);
            auditImpactExploration(ctx, node);
            break;
        case "cause":
            auditImpactExploration(ctx, node);
            auditDisposition(ctx, node, true);
            break;
        case "impact":
            auditDisposition(ctx, node, false);
            break;
        case "cause_unknown":
            auditUnknown(ctx, node);
            break;
        case "measure":
            auditMeasure(ctx, node);
            break;
    }
}
export function auditCausalImpact(document) {
    const profiles = document.framework?.rules.filter((r) => r.kind === "profile") ?? [];
    const findings = [];
    for (const profile of profiles) {
        if (profile.value !== PROFILE)
            findings.push(relationFinding(document.framework.name, "CI000", `未知の監査プロファイル ${profile.value}。`, "fatal", profile.span));
    }
    if (!profiles.some((p) => p.value === PROFILE))
        return findings;
    const nodes = document.steps.map((s) => s.statement);
    if (!nodes.some((node) => roleOf(node) === "phenomenon")) {
        findings.push(relationFinding(document.framework.name, "CI012", "選択した因果・影響監査に phenomenon の役割を持つ記述がない。", "warning", document.framework.span, { profile_id: PROFILE }));
    }
    const ctx = {
        byId: new Map(nodes.map((n) => [n.id, n])),
        causal: new Map(),
        reverseCausal: new Map(),
        caused: new Set(),
        impactOrigins: new Set(),
        actedOn: new Set(),
        findings,
    };
    for (const node of nodes) {
        auditRole(ctx, node);
        if (node.role === "decision")
            collectDecision(ctx, node);
    }
    // Both queries are existential: propagate all causes forward and all impacts
    // backward once rather than recomputing a transitive set per node pair.
    ctx.caused = reachable(nodes.filter((n) => roleOf(n) === "cause").map((n) => n.id), ctx.causal);
    ctx.impactOrigins = reachable(nodes.filter((n) => roleOf(n) === "impact").map((n) => n.id), ctx.reverseCausal);
    nodes.forEach((node) => auditNode(ctx, node));
    return findings;
}
//# sourceMappingURL=causal-impact.js.map