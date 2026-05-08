import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

import type { AuditReport } from "../model/diagnostics.js";
import {
  cosineSimilarity,
  embedTexts,
  type EmbeddingRequestOptions,
} from "../semantic/embeddings.js";

export type ThoughtStatus = "draft" | "finalized";
export type ThoughtReflectionKind =
  | "note"
  | "concern"
  | "decision"
  | "follow_up"
  | "audit_response";
export type ThoughtEventKind =
  | "draft_saved"
  | "audit_recorded"
  | "finalized"
  | "related_created"
  | "reflect_recorded";

export interface ThoughtReflection {
  id: string;
  at: string;
  kind: ThoughtReflectionKind;
  text: string;
}

export interface ThoughtRecord {
  id: string;
  created_at: string;
  updated_at: string;
  status: ThoughtStatus;
  derived_from?: string;
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
  semanticAuditText?: string;
  latestAudit?: AuditReport;
  history: ThoughtEvent[];
  reflections: ThoughtReflection[];
}

export interface ThoughtSearchResult {
  id: string;
  status: ThoughtStatus;
  score: number;
  source: ThoughtSearchSource;
  excerpt: string;
  explanation?: string;
}

export type ThoughtSearchSource =
  | "draft"
  | "final"
  | "reflection"
  | "draft+final"
  | "draft+reflection"
  | "final+reflection"
  | "draft+final+reflection";

export interface ThoughtSearchOptions extends EmbeddingRequestOptions {
  includeReflections?: boolean;
}

interface ThoughtSearchCandidate {
  id: string;
  status: ThoughtStatus;
  source: "draft" | "final" | "reflection";
  text: string;
}

interface ThoughtPaths {
  rootDir: string;
  thoughtsDir: string;
  thoughtDir: string;
  auditsDir: string;
  semanticAuditPath: string;
  recordPath: string;
  historyPath: string;
  reflectionsPath: string;
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
    semanticAuditPath: join(thoughtDir, "semantic-audit.dsl"),
    recordPath: join(thoughtDir, "thought.json"),
    historyPath: join(thoughtDir, "history.json"),
    reflectionsPath: join(thoughtDir, "reflections.json"),
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
  return absolutePath.startsWith(root)
    ? absolutePath.slice(root.length + 1)
    : absolutePath;
}

export function ensureThoughtRecord(
  id: string,
  baseDir?: string,
): ThoughtRecord {
  const paths = ensureThoughtDir(id, baseDir);
  const existing = readJsonFile<ThoughtRecord | undefined>(
    paths.recordPath,
    undefined,
  );
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

function appendThoughtEvent(
  id: string,
  event: ThoughtEvent,
  baseDir?: string,
): void {
  const paths = ensureThoughtDir(id, baseDir);
  const history = readJsonFile<ThoughtEvent[]>(paths.historyPath, []);
  history.push(event);
  writeJsonFile(paths.historyPath, history);
}

function readThoughtReflections(
  id: string,
  baseDir?: string,
): ThoughtReflection[] {
  const paths = ensureThoughtDir(id, baseDir);
  return readJsonFile<ThoughtReflection[]>(paths.reflectionsPath, []);
}

function writeThoughtReflections(
  id: string,
  reflections: ThoughtReflection[],
  baseDir?: string,
): void {
  const paths = ensureThoughtDir(id, baseDir);
  writeJsonFile(paths.reflectionsPath, reflections);
}

function createReflectionId(reflectedAt: string): string {
  return `reflection-${reflectedAt.replaceAll(":", "-")}`;
}

export function draftThought(
  id: string,
  text: string,
  baseDir?: string,
): ThoughtRecord {
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
  appendThoughtEvent(
    id,
    {
      at: updated.updated_at,
      kind: "draft_saved",
      summary: "draft を保存した。",
      path: updated.current_draft_path,
    },
    baseDir,
  );
  return updated;
}

export function relateThought(
  id: string,
  fromThoughtId: string,
  baseDir?: string,
): ThoughtRecord {
  const source = loadThought(fromThoughtId, baseDir);
  const text = source.finalText ?? source.draftText;
  if (!text) {
    throw new Error(
      `Thought ${fromThoughtId} does not have a draft or final text yet.`,
    );
  }

  const paths = ensureThoughtDir(id, baseDir);
  const existing = ensureThoughtRecord(id, baseDir);
  writeFileSync(paths.draftPath, text, "utf8");
  const updatedAt = nowIso();
  const updated: ThoughtRecord = {
    ...existing,
    updated_at: updatedAt,
    derived_from: fromThoughtId,
    current_draft_path: relativeToRoot(paths.draftPath, baseDir),
  };
  writeThoughtRecord(updated, baseDir);
  appendThoughtEvent(
    id,
    {
      at: updatedAt,
      kind: "related_created",
      summary: `related thought を ${fromThoughtId} から作成した。`,
      path: updated.current_draft_path,
    },
    baseDir,
  );
  return updated;
}

export function finalizeThought(
  id: string,
  text: string,
  baseDir?: string,
): ThoughtRecord {
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
  appendThoughtEvent(
    id,
    {
      at: updatedAt,
      kind: "finalized",
      summary: "final を保存した。",
      path: updated.final_path,
    },
    baseDir,
  );
  return updated;
}

export function addThoughtReflection(
  id: string,
  text: string,
  kind: ThoughtReflectionKind = "note",
  baseDir?: string,
): ThoughtRecord {
  const record = ensureThoughtRecord(id, baseDir);
  const reflectedAt = nowIso();
  const reflections = readThoughtReflections(id, baseDir);
  reflections.push({
    id: createReflectionId(reflectedAt),
    at: reflectedAt,
    kind,
    text,
  });
  writeThoughtReflections(id, reflections, baseDir);

  const updated: ThoughtRecord = {
    ...record,
    updated_at: reflectedAt,
  };
  writeThoughtRecord(updated, baseDir);
  appendThoughtEvent(
    id,
    {
      at: reflectedAt,
      kind: "reflect_recorded",
      summary: `reflect を追加した。kind=${kind}`,
    },
    baseDir,
  );
  return updated;
}

export function recordThoughtAudit(
  id: string,
  report: AuditReport,
  baseDir?: string,
): ThoughtRecord {
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
  appendThoughtEvent(
    id,
    {
      at: updatedAt,
      kind: "audit_recorded",
      summary: `audit を保存した。fatal=${report.summary.fatal_count} error=${report.summary.error_count} warning=${report.summary.warning_count}`,
      path: updated.latest_audit_path,
    },
    baseDir,
  );
  return updated;
}

export function loadThought(id: string, baseDir?: string): ThoughtSnapshot {
  const paths = thoughtPaths(id, baseDir);
  if (!existsSync(paths.recordPath)) {
    throw new Error(`Thought ${id} was not found.`);
  }
  const record = readJsonFile<ThoughtRecord>(
    paths.recordPath,
    ensureThoughtRecord(id, baseDir),
  );
  const history = readJsonFile<ThoughtEvent[]>(paths.historyPath, []);
  const latestAudit = record.latest_audit_path
    ? readJsonFile<AuditReport | undefined>(
        resolve(baseDir ?? process.cwd(), record.latest_audit_path),
        undefined,
      )
    : undefined;
  return {
    record,
    draftText: readTextIfExists(paths.draftPath),
    finalText: readTextIfExists(paths.finalPath),
    semanticAuditText: readTextIfExists(paths.semanticAuditPath),
    latestAudit,
    history,
    reflections: readThoughtReflections(id, baseDir),
  };
}

export function deleteThought(id: string, baseDir?: string): boolean {
  const paths = thoughtPaths(id, baseDir);
  if (!existsSync(paths.recordPath)) {
    return false;
  }
  rmSync(paths.thoughtDir, { recursive: true, force: true });
  return true;
}

export function listThoughts(baseDir?: string): ThoughtRecord[] {
  const root = resolve(baseDir ?? process.cwd(), ".llmthink", "thoughts");
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) =>
      readJsonFile<ThoughtRecord>(join(root, entry.name, "thought.json"), {
        id: entry.name,
        created_at: nowIso(),
        updated_at: nowIso(),
        status: "draft",
      }),
    )
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

function collectThoughtSearchCandidates(
  options?: ThoughtSearchOptions,
  baseDir?: string,
): ThoughtSearchCandidate[] {
  return listThoughts(baseDir).flatMap((record) => {
    const snapshot = loadThought(record.id, baseDir);
    const candidates: ThoughtSearchCandidate[] = [];
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

function lexicalSearchThoughts(
  query: string,
  baseDir?: string,
  options?: ThoughtSearchOptions,
): ThoughtSearchResult[] {
  return collapseSearchResults(
    collectThoughtSearchCandidates(options, baseDir)
      .map((candidate) => ({
        id: candidate.id,
        status: candidate.status,
        score: scoreText(candidate.text, query),
        source: candidate.source,
        excerpt: excerpt(candidate.text, query),
        explanation: "lexical fallback",
      }))
      .filter((candidate) => candidate.score > 0),
  );
}

function mergeSourceKinds(
  left: ThoughtSearchResult["source"],
  right: ThoughtSearchResult["source"],
): ThoughtSearchResult["source"] {
  return [...new Set([...left.split("+"), ...right.split("+")])]
    .sort((first, second) => {
      const order = ["draft", "final", "reflection"];
      return order.indexOf(first) - order.indexOf(second);
    })
    .join("+") as ThoughtSearchResult["source"];
}

function collapseSearchResults(
  results: ThoughtSearchResult[],
): ThoughtSearchResult[] {
  const merged = new Map<string, ThoughtSearchResult>();
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

  return [...merged.values()].sort(
    (left, right) =>
      right.score - left.score || right.id.localeCompare(left.id),
  );
}

export async function searchThoughtRecords(
  query: string,
  baseDir?: string,
  options?: ThoughtSearchOptions,
): Promise<ThoughtSearchResult[]> {
  const candidates = collectThoughtSearchCandidates(options, baseDir);
  if (!query.trim() || candidates.length === 0) {
    return [];
  }

  try {
    const result = await embedTexts(
      [query, ...candidates.map((candidate) => candidate.text)],
      options,
    );
    if (!result) {
      return lexicalSearchThoughts(query, baseDir, options);
    }

    const queryEmbedding = result.embeddings[0] ?? [];
    return collapseSearchResults(
      candidates
        .map((candidate, index) => ({
          id: candidate.id,
          status: candidate.status,
          score: Number(
            Math.max(
              0,
              cosineSimilarity(
                queryEmbedding,
                result.embeddings[index + 1] ?? [],
              ),
            ).toFixed(4),
          ),
          source: candidate.source,
          excerpt: excerpt(candidate.text, query),
          explanation: `${result.provider}/${result.model}`,
        }))
        .filter((candidate) => candidate.score > 0),
    );
  } catch {
    return lexicalSearchThoughts(query, baseDir, options);
  }
}
