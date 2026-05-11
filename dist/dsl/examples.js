import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
const candidateRoots = (() => {
    const roots = [process.cwd()];
    const entryPoint = process.argv[1];
    if (entryPoint) {
        const entryDir = dirname(resolve(entryPoint));
        roots.push(resolve(entryDir, ".."));
        roots.push(resolve(entryDir, "..", ".."));
    }
    return roots;
})();
export const DSL_EXAMPLES = [
    {
        id: "decision-comparison",
        path: "docs/examples/decision-comparison.dsl",
        summary: "同一 problem / viewpoint 内の decision comparison 例",
    },
    {
        id: "ideation-profile",
        path: "docs/examples/ideation-profile.dsl",
        summary: "発想支援 profile の代表例",
    },
    {
        id: "problem-solving-profile",
        path: "docs/examples/problem-solving-profile.dsl",
        summary: "課題解決 profile の代表例",
    },
    {
        id: "framework-requires-and",
        path: "docs/examples/framework-requires-and.dsl",
        summary: "framework の requires and/or を含む最小例",
    },
    {
        id: "decision-minimal",
        path: "docs/examples/decision-minimal.dsl",
        summary: "decision と based_on の最小例",
    },
    {
        id: "contradiction-pending",
        path: "docs/examples/contradiction-pending.dsl",
        summary: "decision と pending が同居する監査例",
    },
    {
        id: "query-assist",
        path: "docs/examples/query-assist.dsl",
        summary: "解決済み query の代表例",
    },
    {
        id: "query-unresolved",
        path: "docs/examples/query-unresolved.dsl",
        summary: "未解決参照を含む対比例",
    },
    {
        id: "dsl-samples",
        path: "docs/examples/dsl-samples.md",
        summary: "DSL 全体サンプル集",
    },
    {
        id: "query-assist-audit",
        path: "docs/examples/query-assist.audit.json",
        summary: "query 実行後の監査出力サンプル",
    },
    {
        id: "query-unresolved-audit",
        path: "docs/examples/query-unresolved.audit.json",
        summary: "未解決 query 例に対応する監査出力",
    },
    {
        id: "framework-requires-and-audit",
        path: "docs/examples/framework-requires-and.audit.json",
        summary: "framework requires and/or 例の監査出力",
    },
    {
        id: "audit-output-sample",
        path: "docs/examples/audit-output-sample.json",
        summary: "監査結果 JSON の全体像",
    },
];
const EXAMPLE_LOOKUP = new Map(DSL_EXAMPLES.map((entry) => [entry.id, entry]));
export function getDslExample(id) {
    return EXAMPLE_LOOKUP.get(id);
}
export function listDslExamples(ids) {
    if (!ids || ids.length === 0) {
        return [...DSL_EXAMPLES];
    }
    return ids
        .map((id) => EXAMPLE_LOOKUP.get(id))
        .filter((entry) => Boolean(entry));
}
export function resolveDslExamplePath(id, cwd = process.cwd()) {
    const entry = getDslExample(id);
    if (!entry) {
        return undefined;
    }
    const candidates = [resolve(cwd, entry.path), ...candidateRoots.map((root) => resolve(root, entry.path))];
    const seen = new Set();
    return candidates.find((candidate) => {
        if (seen.has(candidate)) {
            return false;
        }
        seen.add(candidate);
        return existsSync(candidate);
    });
}
//# sourceMappingURL=examples.js.map