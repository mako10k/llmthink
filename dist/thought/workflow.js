import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { auditDslText } from "../analyzer/audit.js";
import { draftThought, recordThoughtAudit } from "./store.js";
function generatedThoughtId() {
    return `thought-${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}`;
}
export function normalizeThoughtId(value) {
    const normalized = value
        .trim()
        .replace(/\.dsl$/i, "")
        .replace(/[\\/]+/g, "-")
        .replace(/[^A-Za-z0-9_-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^[-_]+|[-_]+$/g, "");
    return normalized || generatedThoughtId();
}
export function deriveThoughtIdFromDocumentId(documentId) {
    return normalizeThoughtId(documentId);
}
export function deriveThoughtIdFromFilePath(filePath, baseDir) {
    const root = resolve(baseDir ?? process.cwd());
    const absolutePath = resolve(root, filePath);
    const relativePath = relative(root, absolutePath);
    const preferredPath = relativePath && !relativePath.startsWith("..") ? relativePath : absolutePath;
    return normalizeThoughtId(preferredPath);
}
function resolveThoughtId(request, baseDir) {
    if (request.thoughtId?.trim()) {
        return {
            thoughtId: normalizeThoughtId(request.thoughtId),
            idSource: "explicit",
        };
    }
    if (request.filePath?.trim()) {
        return {
            thoughtId: deriveThoughtIdFromFilePath(request.filePath, baseDir),
            idSource: "file",
        };
    }
    if (request.documentId?.trim()) {
        return {
            thoughtId: deriveThoughtIdFromDocumentId(request.documentId),
            idSource: "document",
        };
    }
    return {
        thoughtId: generatedThoughtId(),
        idSource: "generated",
    };
}
function loadDslText(request, baseDir) {
    if (request.dslText) {
        return request.dslText;
    }
    if (request.filePath) {
        return readFileSync(resolve(baseDir ?? process.cwd(), request.filePath), "utf8");
    }
    throw new Error("dslText or filePath is required to persist an audit.");
}
export async function auditAndPersistThought(request, contextOrBaseDir, legacyStorageRoot) {
    const context = typeof contextOrBaseDir === "string"
        ? { fileBaseDir: contextOrBaseDir, storageRoot: legacyStorageRoot }
        : (contextOrBaseDir ?? {});
    const { thoughtId, idSource } = resolveThoughtId(request, context.fileBaseDir);
    const text = loadDslText(request, context.fileBaseDir);
    draftThought(thoughtId, text, { storageRoot: context.storageRoot });
    const report = await auditDslText(text, thoughtId);
    const record = recordThoughtAudit(thoughtId, report, {
        storageRoot: context.storageRoot,
    });
    return {
        thoughtId,
        idSource,
        report,
        record,
    };
}
//# sourceMappingURL=workflow.js.map