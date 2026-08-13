import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { auditDslText } from "../analyzer/audit.js";
import { alternateLlmthinkFilePath, stripLlmthinkFileExtension, } from "../dsl/file-extension.js";
import { draftThought, recordThoughtAudit, } from "./store.js";
function generatedThoughtId() {
    return `thought-${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}`;
}
function normalizeThoughtIdCharacters(value) {
    let normalized = "";
    for (const character of value) {
        const code = character.codePointAt(0) ?? 0;
        const isAsciiLetter = (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
        const isDigit = code >= 48 && code <= 57;
        const normalizedCharacter = isAsciiLetter || isDigit || character === "_" ? character : "-";
        if (normalizedCharacter !== "-" || !normalized.endsWith("-")) {
            normalized += normalizedCharacter;
        }
    }
    return normalized;
}
function trimThoughtIdEdges(value) {
    let normalized = value;
    while (normalized.startsWith("-") || normalized.startsWith("_")) {
        normalized = normalized.slice(1);
    }
    while (normalized.endsWith("-") || normalized.endsWith("_")) {
        normalized = normalized.slice(0, -1);
    }
    return normalized;
}
export function normalizeThoughtId(value) {
    const trimmed = value.trim();
    const withoutExtension = stripLlmthinkFileExtension(trimmed);
    const normalized = trimThoughtIdEdges(normalizeThoughtIdCharacters(withoutExtension));
    return normalized || generatedThoughtId();
}
export function deriveThoughtIdFromDocumentId(documentId) {
    return normalizeThoughtId(documentId);
}
export function deriveThoughtIdFromFilePath(filePath, baseDir) {
    const root = resolve(baseDir ?? process.cwd());
    const absolutePath = resolve(root, filePath);
    const alternatePath = alternateLlmthinkFilePath(absolutePath);
    if (alternatePath && existsSync(absolutePath) && existsSync(alternatePath)) {
        throw new Error(`Both ${absolutePath} and ${alternatePath} exist; pass --id to keep their thought histories distinct.`);
    }
    const relativePath = relative(root, absolutePath);
    const preferredPath = relativePath && !relativePath.startsWith("..")
        ? relativePath
        : absolutePath;
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