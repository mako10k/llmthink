import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { basename, resolve } from "node:path";
import { AUDIT_SEVERITIES, auditDslText, isLlmthinkFilePath, stripLlmthinkFileExtension, } from "@llmthink/core";
const EMPTY_SUMMARY = {
    fatal_count: 0,
    error_count: 0,
    warning_count: 0,
    info_count: 0,
    hint_count: 0,
};
const IGNORED_DIRECTORY_NAMES = new Set([".git", "node_modules"]);
function collectDirectoryFiles(directory) {
    const files = [];
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
        if (entry.isDirectory() && IGNORED_DIRECTORY_NAMES.has(entry.name)) {
            continue;
        }
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...collectDirectoryFiles(path));
        }
        else if (entry.isFile() && isLlmthinkFilePath(path)) {
            files.push(path);
        }
    }
    return files;
}
function collectFilePaths(inputs, cwd) {
    const paths = [];
    for (const input of inputs) {
        const path = resolve(cwd, input);
        const stat = lstatSync(path);
        if (stat.isDirectory()) {
            paths.push(...collectDirectoryFiles(path));
        }
        else if (stat.isFile()) {
            paths.push(realpathSync(path));
        }
        else {
            throw new Error(`Unsupported check input: ${input}`);
        }
    }
    return [...new Set(paths)].sort();
}
function loadSources(inputs, text, documentId, cwd, stdinText) {
    if (text !== undefined) {
        if (inputs.length > 0) {
            throw new Error("dsl check --text cannot be combined with file inputs.");
        }
        return [{ label: "text", text, documentId: documentId ?? "document" }];
    }
    const stdinRequested = inputs.includes("-");
    const fileInputs = inputs.filter((input) => input !== "-");
    const sources = collectFilePaths(fileInputs, cwd).map((path) => ({
        label: path,
        text: readFileSync(path, "utf8"),
        documentId: stripLlmthinkFileExtension(basename(path)),
    }));
    if (stdinRequested) {
        sources.push({
            label: "stdin",
            text: stdinText ?? readFileSync(0, "utf8"),
            documentId: documentId ?? "stdin",
        });
    }
    if (sources.length === 0) {
        throw new Error("dsl check requires --text, stdin '-', a file, or a directory containing .think/.dsl files.");
    }
    if (documentId && sources.length !== 1) {
        throw new Error("dsl check --id requires a single input.");
    }
    if (documentId) {
        sources[0].documentId = documentId;
    }
    return sources;
}
function mergeSummary(target, source) {
    for (const severity of AUDIT_SEVERITIES) {
        const key = `${severity}_count`;
        target[key] += source[key];
    }
}
function thresholdFailed(summary, threshold) {
    const thresholdIndex = AUDIT_SEVERITIES.indexOf(threshold);
    return AUDIT_SEVERITIES.slice(0, thresholdIndex + 1).some((severity) => summary[`${severity}_count`] > 0);
}
export async function checkDslSources(options) {
    const sources = loadSources(options.inputs, options.text, options.documentId, options.cwd ?? process.cwd(), options.stdinText);
    const documentsByDigest = new Map();
    for (const source of sources) {
        const digest = `sha256:${createHash("sha256")
            .update(source.text)
            .digest("hex")}`;
        const existing = documentsByDigest.get(digest);
        if (existing) {
            if (!existing.sources.includes(source.label)) {
                existing.sources.push(source.label);
            }
            continue;
        }
        const report = await auditDslText(source.text, source.documentId);
        documentsByDigest.set(digest, {
            source_sha256: digest,
            sources: [source.label],
            report,
        });
    }
    const documents = [...documentsByDigest.values()];
    const summary = { ...EMPTY_SUMMARY };
    for (const document of documents) {
        mergeSummary(summary, document.report.summary);
    }
    const failOn = options.failOn ?? "error";
    return {
        persisted: false,
        fail_on: failOn,
        failed: thresholdFailed(summary, failOn),
        source_count: sources.length,
        unique_content_count: documents.length,
        summary,
        documents,
    };
}
//# sourceMappingURL=check.js.map