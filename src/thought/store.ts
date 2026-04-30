import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { AuditReport } from "../model/diagnostics.js";

export type ThoughtStatus = "draft" | "finalized";
export type ThoughtEventKind = "draft_saved" | "audit_recorded" | "finalized";

export interface ThoughtRecord {
  id: string;
  created_at: string;
  updated_at: string;
  status: ThoughtStatus;
  current_draft_path?: string;
  final_path?: string;
  latest_audit_path?: string;
}

export interface ThoughtEvent {
  at: string;
  kind: ThoughtEventKind;
  summary: string;
  path?: string;
}

export interface ThoughtSnapshot {
  record: ThoughtRecord;
  draftText?: string;
  finalText?: string;
  latestAudit?: AuditReport;
  history: ThoughtEvent[];
}

export interface ThoughtSearchResult {
  id: string;
  status: ThoughtStatus;
  score: number;
  source: "draft" | "final";
  excerpt: string;
}

interface ThoughtPaths {
  rootDir: string;
  thoughtsDir: string;
  thoughtDir: string;
  auditsDir: string;
  recordPath: string;
  historyPath: string;
  draftPath: string;
  finalPath: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function thoughtPaths(id: string, baseDir?: string): ThoughtPaths {
  const rootDir = resolve(baseDir ?? process.cwd(), ".llmthink");
  const thoughtsDir = join(rootDir, "thoughts");
  const thoughtDir = join(thoughtsDir, id);
  return {
    rootDir,
    thoughtsDir,
    thoughtDir,
    auditsDir: join(thoughtDir, "audits"),
    recordPath: join(thoughtDir, "thought.json"),
    historyPath: join(thoughtDir, "history.json"),
    draftPath: join(thoughtDir, "draft.dsl"),
    finalPath: join(thoughtDir, "final.dsl"),
  };
}

function ensureThoughtDir(id: string, baseDir?: string): ThoughtPaths {
  const paths = thoughtPaths(id, baseDir);
  mkdirSync(paths.auditsDir, { recursive: true });
  return paths;
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function writeJsonFile(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readTextIfExists(filePath: string): string | undefined {
  if (!existsSync(filePath)) {
    return undefined;
  }
  return readFileSync(filePath, "utf8");
}

function relativeToRoot(absolutePath: string, baseDir?: string): string {
  const root = resolve(baseDir ?? process.cwd());
  return absolutePath.startsWith(root) ? absolutePath.slice(root.length + 1) : absolutePath;
}

export function ensureThoughtRecord(id: string, baseDir?: string): ThoughtRecord {
  const paths = ensureThoughtDir(id, baseDir);
  const existing = readJsonFile<ThoughtRecord | undefined>(paths.recordPath, undefined);
  if (existing) {
    return existing;
  }

  const created = nowIso();
  const record: ThoughtRecord = {
    id,
    created_at: created,
    updated_at: created,
    status: "draft",
  };
  writeJsonFile(paths.recordPath, record);
  writeJsonFile(paths.historyPath, [] satisfies ThoughtEvent[]);
  return record;
}

function writeThoughtRecord(record: ThoughtRecord, baseDir?: string): void {
  const paths = ensureThoughtDir(record.id, baseDir);
  writeJsonFile(paths.recordPath, record);
}

function appendThoughtEvent(id: string, event: ThoughtEvent, baseDir?: string): void {
  const paths = ensureThoughtDir(id, baseDir);
  const history = readJsonFile<ThoughtEvent[]>(paths.historyPath, []);
  history.push(event);
  writeJsonFile(paths.historyPath, history);
}

export function saveThoughtDraft(id: string, text: string, baseDir?: string): ThoughtRecord {
  const paths = ensureThoughtDir(id, baseDir);
  const record = ensureThoughtRecord(id, baseDir);
  writeFileSync(paths.draftPath, text, "utf8");
  const updated: ThoughtRecord = {
    ...record,
    updated_at: nowIso(),
    status: record.status === "finalized" ? "finalized" : "draft",
    current_draft_path: relativeToRoot(paths.draftPath, baseDir),
  };
  writeThoughtRecord(updated, baseDir);
  appendThoughtEvent(id, {
    at: updated.updated_at,
    kind: "draft_saved",
    summary: "draft を保存した。",
    path: updated.current_draft_path,
  }, baseDir);
  return updated;
}

export function finalizeThought(id: string, text: string, baseDir?: string): ThoughtRecord {
  const paths = ensureThoughtDir(id, baseDir);
  const record = ensureThoughtRecord(id, baseDir);
  writeFileSync(paths.finalPath, text, "utf8");
  const updatedAt = nowIso();
  const updated: ThoughtRecord = {
    ...record,
    updated_at: updatedAt,
    status: "finalized",
    final_path: relativeToRoot(paths.finalPath, baseDir),
  };
  writeThoughtRecord(updated, baseDir);
  appendThoughtEvent(id, {
    at: updatedAt,
    kind: "finalized",
    summary: "final を保存した。",
    path: updated.final_path,
  }, baseDir);
  return updated;
}

export function persistAuditReport(id: string, report: AuditReport, baseDir?: string): ThoughtRecord {
  const paths = ensureThoughtDir(id, baseDir);
  const record = ensureThoughtRecord(id, baseDir);
  const fileName = `${report.generated_at.replaceAll(":", "-")}.json`;
  const auditPath = join(paths.auditsDir, fileName);
  writeJsonFile(auditPath, report);
  const updatedAt = nowIso();
  const updated: ThoughtRecord = {
    ...record,
    updated_at: updatedAt,
    latest_audit_path: relativeToRoot(auditPath, baseDir),
  };
  writeThoughtRecord(updated, baseDir);
  appendThoughtEvent(id, {
    at: updatedAt,
    kind: "audit_recorded",
    summary: `audit を保存した。fatal=${report.summary.fatal_count} error=${report.summary.error_count} warning=${report.summary.warning_count}`,
    path: updated.latest_audit_path,
  }, baseDir);
  return updated;
}

export function loadThought(id: string, baseDir?: string): ThoughtSnapshot {
  const paths = thoughtPaths(id, baseDir);
  if (!existsSync(paths.recordPath)) {
    throw new Error(`Thought ${id} was not found.`);
  }
  const record = readJsonFile<ThoughtRecord>(paths.recordPath, ensureThoughtRecord(id, baseDir));
  const history = readJsonFile<ThoughtEvent[]>(paths.historyPath, []);
  const latestAudit = record.latest_audit_path
    ? readJsonFile<AuditReport | undefined>(resolve(baseDir ?? process.cwd(), record.latest_audit_path), undefined)
    : undefined;
  return {
    record,
    draftText: readTextIfExists(paths.draftPath),
    finalText: readTextIfExists(paths.finalPath),
    latestAudit,
    history,
  };
}

export function listThoughts(baseDir?: string): ThoughtRecord[] {
  const root = resolve(baseDir ?? process.cwd(), ".llmthink", "thoughts");
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readJsonFile<ThoughtRecord>(join(root, entry.name, "thought.json"), {
      id: entry.name,
      created_at: nowIso(),
      updated_at: nowIso(),
      status: "draft",
    }))
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

function excerpt(text: string, query: string): string {
  const normalized = text.replace(/\s+/g, " ");
  const index = normalized.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) {
    return normalized.slice(0, 120);
  }
  const start = Math.max(0, index - 30);
  const end = Math.min(normalized.length, index + query.length + 30);
  return normalized.slice(start, end);
}

function scoreText(text: string, query: string): number {
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

export function searchThoughts(query: string, baseDir?: string): ThoughtSearchResult[] {
  return listThoughts(baseDir)
    .flatMap((record) => {
      const snapshot = loadThought(record.id, baseDir);
      const candidates: ThoughtSearchResult[] = [];
      if (snapshot.finalText) {
        const score = scoreText(snapshot.finalText, query);
        if (score > 0) {
          candidates.push({
            id: record.id,
            status: record.status,
            score,
            source: "final",
            excerpt: excerpt(snapshot.finalText, query),
          });
        }
      }
      if (snapshot.draftText) {
        const score = scoreText(snapshot.draftText, query);
        if (score > 0) {
          candidates.push({
            id: record.id,
            status: record.status,
            score,
            source: "draft",
            excerpt: excerpt(snapshot.draftText, query),
          });
        }
      }
      return candidates;
    })
    .sort((left, right) => right.score - left.score || right.id.localeCompare(left.id));
}