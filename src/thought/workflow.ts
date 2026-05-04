import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

import { auditDslText } from "../analyzer/audit.js";
import type { AuditReport } from "../model/diagnostics.js";
import { draftThought, recordThoughtAudit, type ThoughtRecord } from "./store.js";

export type ThoughtIdSource = "explicit" | "file" | "document" | "generated";

export interface PersistedThoughtAudit {
  thoughtId: string;
  idSource: ThoughtIdSource;
  report: AuditReport;
  record: ThoughtRecord;
}

export interface PersistedThoughtAuditRequest {
  dslText?: string;
  filePath?: string;
  thoughtId?: string;
  documentId?: string;
}

function generatedThoughtId(): string {
  return `thought-${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}`;
}

export function normalizeThoughtId(value: string): string {
  const normalized = value
    .trim()
    .replace(/\.dsl$/i, "")
    .replace(/[\\/]+/g, "-")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
  return normalized || generatedThoughtId();
}

export function deriveThoughtIdFromDocumentId(documentId: string): string {
  return normalizeThoughtId(documentId);
}

export function deriveThoughtIdFromFilePath(
  filePath: string,
  baseDir?: string,
): string {
  const root = resolve(baseDir ?? process.cwd());
  const absolutePath = resolve(root, filePath);
  const relativePath = relative(root, absolutePath);
  const preferredPath =
    relativePath && !relativePath.startsWith("..") ? relativePath : absolutePath;
  return normalizeThoughtId(preferredPath);
}

function resolveThoughtId(
  request: PersistedThoughtAuditRequest,
  baseDir?: string,
): { thoughtId: string; idSource: ThoughtIdSource } {
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

function loadDslText(
  request: PersistedThoughtAuditRequest,
  baseDir?: string,
): string {
  if (request.dslText) {
    return request.dslText;
  }
  if (request.filePath) {
    return readFileSync(resolve(baseDir ?? process.cwd(), request.filePath), "utf8");
  }
  throw new Error("dslText or filePath is required to persist an audit.");
}

export async function auditAndPersistThought(
  request: PersistedThoughtAuditRequest,
  baseDir?: string,
): Promise<PersistedThoughtAudit> {
  const { thoughtId, idSource } = resolveThoughtId(request, baseDir);
  const text = loadDslText(request, baseDir);
  draftThought(thoughtId, text, baseDir);
  const report = await auditDslText(text, thoughtId);
  const record = recordThoughtAudit(thoughtId, report, baseDir);
  return {
    thoughtId,
    idSource,
    report,
    record,
  };
}