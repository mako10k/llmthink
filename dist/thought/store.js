import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, } from "node:fs";
import { join, resolve } from "node:path";
import { resolveThoughtStorageRoot } from "../config/runtime.js";
import { cosineSimilarity, embedTexts, } from "../semantic/embeddings.js";
function resolveStoreRoot(location) {
    if (typeof location === "string") {
        return resolve(location, ".llmthink");
    }
    if (location?.storageRoot) {
        return resolve(location.storageRoot);
    }
    if (location?.baseDir) {
        return resolve(location.baseDir, ".llmthink");
    }
    return resolveThoughtStorageRoot({ cwd: process.cwd() });
}
const SEMANTIC_AUDIT_HEADER = /^semantic_audit\s+([A-Za-z][A-Za-z0-9_-]*)\s+on\s+([A-Za-z][A-Za-z0-9_-]*)\s+support\s+([A-Za-z][A-Za-z0-9_-]*)\s+verdict\s+(supported|unsupported|mixed|unknown):$/;
function nowIso() {
    return new Date().toISOString();
}
function thoughtPaths(id, location) {
    const rootDir = resolveStoreRoot(location);
    const thoughtsDir = join(rootDir, "thoughts");
    const thoughtDir = join(thoughtsDir, id);
    return {
        rootDir,
        thoughtsDir,
        thoughtDir,
        auditsDir: join(thoughtDir, "audits"),
        semanticAuditPath: join(thoughtDir, "semantic-audit.dsl"),
        recordPath: join(thoughtDir, "thought.json"),
        historyPath: join(thoughtDir, "history.json"),
        reflectionsPath: join(thoughtDir, "reflections.json"),
        draftPath: join(thoughtDir, "draft.dsl"),
        finalPath: join(thoughtDir, "final.dsl"),
    };
}
function ensureThoughtDir(id, location) {
    const paths = thoughtPaths(id, location);
    mkdirSync(paths.auditsDir, { recursive: true });
    return paths;
}
function readJsonFile(filePath, fallback) {
    if (!existsSync(filePath)) {
        return fallback;
    }
    return JSON.parse(readFileSync(filePath, "utf8"));
}
function writeJsonFile(filePath, value) {
    writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
function quoteSemanticAuditValue(value) {
    return /^[A-Za-z][A-Za-z0-9_.:-]*$/.test(value)
        ? value
        : JSON.stringify(value);
}
function defaultSemanticAuditId(input) {
    return input.auditId ?? `${input.supportId}-${input.decisionId}`;
}
function formatSemanticAuditBlock(input) {
    const auditId = defaultSemanticAuditId(input);
    const auditedAt = input.auditedAt ?? nowIso();
    const metadataLines = [
        input.reviewer
            ? `  reviewer ${quoteSemanticAuditValue(input.reviewer)}`
            : undefined,
        input.model ? `  model ${quoteSemanticAuditValue(input.model)}` : undefined,
        `  audited_at ${quoteSemanticAuditValue(auditedAt)}`,
        input.sourceThoughtId
            ? `  source_thought ${quoteSemanticAuditValue(input.sourceThoughtId)}`
            : undefined,
    ].filter((line) => Boolean(line));
    return [
        `semantic_audit ${auditId} on ${input.decisionId} support ${input.supportId} verdict ${input.verdict}:`,
        ...metadataLines,
        `  ${JSON.stringify(input.reason)}`,
    ].join("\n");
}
function matchesSemanticAuditBlock(block, input) {
    const header = block.split(/\r?\n/, 1)[0]?.trim() ?? "";
    const match = header.match(SEMANTIC_AUDIT_HEADER);
    if (!match) {
        return false;
    }
    const [, auditId, decisionId, supportId] = match;
    const targetAuditId = defaultSemanticAuditId(input);
    return (auditId === targetAuditId ||
        (decisionId === input.decisionId && supportId === input.supportId));
}
function upsertSemanticAuditText(existingText, input) {
    const nextBlock = formatSemanticAuditBlock(input);
    const blocks = (existingText ?? "")
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean);
    const updatedBlocks = [];
    let replaced = false;
    for (const block of blocks) {
        if (matchesSemanticAuditBlock(block, input)) {
            updatedBlocks.push(nextBlock);
            replaced = true;
            continue;
        }
        updatedBlocks.push(block);
    }
    if (!replaced) {
        updatedBlocks.push(nextBlock);
    }
    return `${updatedBlocks.join("\n\n")}\n`;
}
function readTextIfExists(filePath) {
    if (!existsSync(filePath)) {
        return undefined;
    }
    return readFileSync(filePath, "utf8");
}
function relativeToRoot(absolutePath, location) {
    const root = resolveStoreRoot(location);
    return absolutePath.startsWith(root)
        ? absolutePath.slice(root.length + 1)
        : absolutePath;
}
export function ensureThoughtRecord(id, location) {
    const paths = ensureThoughtDir(id, location);
    const existing = readJsonFile(paths.recordPath, undefined);
    if (existing) {
        return existing;
    }
    const created = nowIso();
    const record = {
        id,
        created_at: created,
        updated_at: created,
        status: "draft",
    };
    writeJsonFile(paths.recordPath, record);
    writeJsonFile(paths.historyPath, []);
    return record;
}
function writeThoughtRecord(record, location) {
    const paths = ensureThoughtDir(record.id, location);
    writeJsonFile(paths.recordPath, record);
}
function appendThoughtEvent(id, event, location) {
    const paths = ensureThoughtDir(id, location);
    const history = readJsonFile(paths.historyPath, []);
    history.push(event);
    writeJsonFile(paths.historyPath, history);
}
function readThoughtReflections(id, location) {
    const paths = ensureThoughtDir(id, location);
    return readJsonFile(paths.reflectionsPath, []);
}
function writeThoughtReflections(id, reflections, location) {
    const paths = ensureThoughtDir(id, location);
    writeJsonFile(paths.reflectionsPath, reflections);
}
function createReflectionId(reflectedAt) {
    return `reflection-${reflectedAt.replaceAll(":", "-")}`;
}
export function draftThought(id, text, location) {
    const paths = ensureThoughtDir(id, location);
    const record = ensureThoughtRecord(id, location);
    writeFileSync(paths.draftPath, text, "utf8");
    const updated = {
        ...record,
        updated_at: nowIso(),
        status: record.status === "finalized" ? "finalized" : "draft",
        current_draft_path: relativeToRoot(paths.draftPath, location),
    };
    writeThoughtRecord(updated, location);
    appendThoughtEvent(id, {
        at: updated.updated_at,
        kind: "draft_saved",
        summary: "draft を保存した。",
        path: updated.current_draft_path,
    }, location);
    return updated;
}
export function relateThought(id, fromThoughtId, location) {
    const source = loadThought(fromThoughtId, location);
    const text = source.finalText ?? source.draftText;
    if (!text) {
        throw new Error(`Thought ${fromThoughtId} does not have a draft or final text yet.`);
    }
    const paths = ensureThoughtDir(id, location);
    const existing = ensureThoughtRecord(id, location);
    writeFileSync(paths.draftPath, text, "utf8");
    const updatedAt = nowIso();
    const updated = {
        ...existing,
        updated_at: updatedAt,
        derived_from: fromThoughtId,
        current_draft_path: relativeToRoot(paths.draftPath, location),
    };
    writeThoughtRecord(updated, location);
    appendThoughtEvent(id, {
        at: updatedAt,
        kind: "related_created",
        summary: `related thought を ${fromThoughtId} から作成した。`,
        path: updated.current_draft_path,
    }, location);
    return updated;
}
export function finalizeThought(id, text, location) {
    const paths = ensureThoughtDir(id, location);
    const record = ensureThoughtRecord(id, location);
    writeFileSync(paths.finalPath, text, "utf8");
    const updatedAt = nowIso();
    const updated = {
        ...record,
        updated_at: updatedAt,
        status: "finalized",
        final_path: relativeToRoot(paths.finalPath, location),
    };
    writeThoughtRecord(updated, location);
    appendThoughtEvent(id, {
        at: updatedAt,
        kind: "finalized",
        summary: "final を保存した。",
        path: updated.final_path,
    }, location);
    return updated;
}
export function addThoughtReflection(id, text, kind = "note", location) {
    const record = ensureThoughtRecord(id, location);
    const reflectedAt = nowIso();
    const reflections = readThoughtReflections(id, location);
    reflections.push({
        id: createReflectionId(reflectedAt),
        at: reflectedAt,
        kind,
        text,
    });
    writeThoughtReflections(id, reflections, location);
    const updated = {
        ...record,
        updated_at: reflectedAt,
    };
    writeThoughtRecord(updated, location);
    appendThoughtEvent(id, {
        at: reflectedAt,
        kind: "reflect_recorded",
        summary: `reflect を追加した。kind=${kind}`,
    }, location);
    return updated;
}
export function recordThoughtAudit(id, report, location) {
    const paths = ensureThoughtDir(id, location);
    const record = ensureThoughtRecord(id, location);
    const fileName = `${report.generated_at.replaceAll(":", "-")}.json`;
    const auditPath = join(paths.auditsDir, fileName);
    writeJsonFile(auditPath, report);
    const updatedAt = nowIso();
    const updated = {
        ...record,
        updated_at: updatedAt,
        latest_audit_path: relativeToRoot(auditPath, location),
    };
    writeThoughtRecord(updated, location);
    appendThoughtEvent(id, {
        at: updatedAt,
        kind: "audit_recorded",
        summary: `audit を保存した。fatal=${report.summary.fatal_count} error=${report.summary.error_count} warning=${report.summary.warning_count}`,
        path: updated.latest_audit_path,
    }, location);
    return updated;
}
export function saveThoughtSemanticAudit(id, input, location) {
    const paths = ensureThoughtDir(id, location);
    const record = ensureThoughtRecord(id, location);
    const nextText = upsertSemanticAuditText(readTextIfExists(paths.semanticAuditPath), input);
    writeFileSync(paths.semanticAuditPath, nextText, "utf8");
    const updatedAt = nowIso();
    const updated = {
        ...record,
        updated_at: updatedAt,
    };
    writeThoughtRecord(updated, location);
    appendThoughtEvent(id, {
        at: updatedAt,
        kind: "semantic_audit_saved",
        summary: `semantic audit を保存した。${input.supportId}->${input.decisionId} verdict=${input.verdict}`,
        path: relativeToRoot(paths.semanticAuditPath, location),
    }, location);
    return updated;
}
export function loadThought(id, location) {
    const paths = thoughtPaths(id, location);
    if (!existsSync(paths.recordPath)) {
        throw new Error(`Thought ${id} was not found.`);
    }
    const record = readJsonFile(paths.recordPath, ensureThoughtRecord(id, location));
    const history = readJsonFile(paths.historyPath, []);
    const latestAudit = record.latest_audit_path
        ? readJsonFile(resolve(paths.rootDir, record.latest_audit_path), undefined)
        : undefined;
    return {
        record,
        draftText: readTextIfExists(paths.draftPath),
        finalText: readTextIfExists(paths.finalPath),
        semanticAuditText: readTextIfExists(paths.semanticAuditPath),
        latestAudit,
        history,
        reflections: readThoughtReflections(id, location),
    };
}
export function deleteThought(id, location) {
    const paths = thoughtPaths(id, location);
    if (!existsSync(paths.recordPath)) {
        return false;
    }
    rmSync(paths.thoughtDir, { recursive: true, force: true });
    return true;
}
export function listThoughts(location) {
    const root = join(resolveStoreRoot(location), "thoughts");
    if (!existsSync(root)) {
        return [];
    }
    return readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => readJsonFile(join(root, entry.name, "thought.json"), {
        id: entry.name,
        created_at: nowIso(),
        updated_at: nowIso(),
        status: "draft",
    }))
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}
function excerpt(text, query) {
    const normalized = text.replace(/\s+/g, " ");
    const index = normalized.toLowerCase().indexOf(query.toLowerCase());
    if (index === -1) {
        return normalized.slice(0, 120);
    }
    const start = Math.max(0, index - 30);
    const end = Math.min(normalized.length, index + query.length + 30);
    return normalized.slice(start, end);
}
function scoreText(text, query) {
    const normalizedText = text.toLowerCase();
    const normalizedQuery = query.toLowerCase();
    if (!normalizedQuery) {
        return 0;
    }
    const occurrences = normalizedText.split(normalizedQuery).length - 1;
    if (occurrences <= 0) {
        return 0;
    }
    return Number(Math.min(1, 0.3 + occurrences * 0.2).toFixed(4));
}
function collectThoughtSearchCandidates(options, location) {
    return listThoughts(location).flatMap((record) => {
        const snapshot = loadThought(record.id, location);
        const candidates = [];
        if (snapshot.finalText) {
            candidates.push({
                id: record.id,
                status: record.status,
                source: "final",
                text: snapshot.finalText,
            });
        }
        if (snapshot.draftText) {
            candidates.push({
                id: record.id,
                status: record.status,
                source: "draft",
                text: snapshot.draftText,
            });
        }
        if (options?.includeReflections) {
            for (const reflection of snapshot.reflections) {
                candidates.push({
                    id: record.id,
                    status: record.status,
                    source: "reflection",
                    text: reflection.text,
                });
            }
        }
        return candidates;
    });
}
function lexicalSearchThoughts(query, location, options) {
    return collapseSearchResults(collectThoughtSearchCandidates(options, location)
        .map((candidate) => ({
        id: candidate.id,
        status: candidate.status,
        score: scoreText(candidate.text, query),
        source: candidate.source,
        excerpt: excerpt(candidate.text, query),
        explanation: "lexical fallback",
    }))
        .filter((candidate) => candidate.score > 0));
}
function mergeSourceKinds(left, right) {
    return [...new Set([...left.split("+"), ...right.split("+")])]
        .sort((first, second) => {
        const order = ["draft", "final", "reflection"];
        return order.indexOf(first) - order.indexOf(second);
    })
        .join("+");
}
function collapseSearchResults(results) {
    const merged = new Map();
    for (const result of results) {
        const existing = merged.get(result.id);
        if (!existing) {
            merged.set(result.id, result);
            continue;
        }
        const keepCurrent = result.score > existing.score;
        const preferred = keepCurrent ? result : existing;
        const alternate = keepCurrent ? existing : result;
        merged.set(result.id, {
            ...preferred,
            source: mergeSourceKinds(preferred.source, alternate.source),
            explanation: preferred.explanation,
        });
    }
    return [...merged.values()].sort((left, right) => right.score - left.score || right.id.localeCompare(left.id));
}
export async function searchThoughtRecords(query, location, options) {
    const candidates = collectThoughtSearchCandidates(options, location);
    if (!query.trim() || candidates.length === 0) {
        return [];
    }
    try {
        const result = await embedTexts([query, ...candidates.map((candidate) => candidate.text)], options);
        if (!result) {
            return lexicalSearchThoughts(query, location, options);
        }
        const queryEmbedding = result.embeddings[0] ?? [];
        return collapseSearchResults(candidates
            .map((candidate, index) => ({
            id: candidate.id,
            status: candidate.status,
            score: Number(Math.max(0, cosineSimilarity(queryEmbedding, result.embeddings[index + 1] ?? [])).toFixed(4)),
            source: candidate.source,
            excerpt: excerpt(candidate.text, query),
            explanation: `${result.provider}/${result.model}`,
        }))
            .filter((candidate) => candidate.score > 0));
    }
    catch {
        return lexicalSearchThoughts(query, location, options);
    }
}
//# sourceMappingURL=store.js.map