import type {
  ThoughtEvent,
  ThoughtReflection,
  ThoughtRecord,
  ThoughtSearchResult,
  ThoughtSnapshot,
} from "../thought/store.js";
import { parseDocument } from "../parser/parser.js";
import type { PersistedThoughtAudit } from "../thought/workflow.js";

type SemanticAuditVerdict = "supported" | "unsupported" | "mixed" | "unknown";

interface SemanticAuditEntry {
  auditId: string;
  decisionId: string;
  supportId: string;
  verdict: SemanticAuditVerdict;
  reason?: string;
  metadata: Record<string, string>;
}

interface SemanticAuditOverview {
  entries: SemanticAuditEntry[];
  unreviewedPairs: Array<{ decisionId: string; supportId: string }>;
}

const SEMANTIC_AUDIT_HEADER =
  /^semantic_audit\s+([A-Za-z][A-Za-z0-9_-]*)\s+on\s+([A-Za-z][A-Za-z0-9_-]*)\s+support\s+([A-Za-z][A-Za-z0-9_-]*)\s+verdict\s+(supported|unsupported|mixed|unknown):$/;

function stripQuotedValue(value: string): string {
  return value.replace(/^"/, "").replace(/"$/, "");
}

function parseSemanticAuditEntries(text: string | undefined): SemanticAuditEntry[] {
  if (!text) {
    return [];
  }

  const lines = text.split(/\r?\n/);
  const entries: SemanticAuditEntry[] = [];
  let index = 0;

  while (index < lines.length) {
    const rawLine = lines[index] ?? "";
    const line = rawLine.trim();
    const header = line.match(SEMANTIC_AUDIT_HEADER);
    if (!header) {
      index += 1;
      continue;
    }

    const [, auditId, decisionId, supportId, verdict] = header;
    const entry: SemanticAuditEntry = {
      auditId,
      decisionId,
      supportId,
      verdict: verdict as SemanticAuditVerdict,
      metadata: {},
    };
    const baseIndent = rawLine.match(/^\s*/)?.[0].length ?? 0;
    index += 1;

    while (index < lines.length) {
      const childRawLine = lines[index] ?? "";
      const childLine = childRawLine.trim();
      const childIndent = childRawLine.match(/^\s*/)?.[0].length ?? 0;
      if (!childLine) {
        index += 1;
        continue;
      }
      if (childIndent <= baseIndent) {
        break;
      }

      if (childLine.startsWith("\"") && childLine.endsWith("\"")) {
        if (!entry.reason) {
          entry.reason = stripQuotedValue(childLine);
        }
        index += 1;
        continue;
      }

      const metadataMatch = childLine.match(/^([a-z][a-z0-9_]*)\s+(.+)$/i);
      if (metadataMatch) {
        const [, key, rawValue] = metadataMatch;
        entry.metadata[key] =
          rawValue.startsWith("\"") && rawValue.endsWith("\"")
            ? stripQuotedValue(rawValue)
            : rawValue;
      }
      index += 1;
    }

    entries.push(entry);
  }

  return entries;
}

function collectThoughtSupportPairs(text: string | undefined): Array<{ decisionId: string; supportId: string }> {
  if (!text) {
    return [];
  }

  const document = parseDocument(text);
  const statementRoles = new Map(
    document.steps.map((step) => [step.statement.id, step.statement.role] as const),
  );

  return document.steps.flatMap((step) => {
    if (step.statement.role !== "decision") {
      return [];
    }
    return step.statement.basedOn
      .filter((refId) => {
        const role = statementRoles.get(refId);
        return role === "premise" || role === "evidence";
      })
      .map((supportId) => ({
        decisionId: step.statement.id,
        supportId,
      }));
  });
}

function buildSemanticAuditOverview(snapshot: ThoughtSnapshot): SemanticAuditOverview {
  const entries = parseSemanticAuditEntries(snapshot.semanticAuditText);
  const currentText = snapshot.finalText ?? snapshot.draftText;
  const supportPairs = collectThoughtSupportPairs(currentText);
  const reviewedPairs = new Set(entries.map((entry) => `${entry.decisionId}::${entry.supportId}`));
  const unreviewedPairs = supportPairs.filter(
    (pair) => !reviewedPairs.has(`${pair.decisionId}::${pair.supportId}`),
  );
  return { entries, unreviewedPairs };
}

function verdictCount(entries: SemanticAuditEntry[], verdict: SemanticAuditVerdict): number {
  return entries.filter((entry) => entry.verdict === verdict).length;
}

export function formatPersistedThoughtAudit(
  persisted: PersistedThoughtAudit,
): string {
  return (
    [
      `thought_id: ${persisted.thoughtId}`,
      `id_source: ${persisted.idSource}`,
      `status: ${persisted.record.status}`,
      `draft: ${persisted.record.current_draft_path ?? "-"}`,
      `latest_audit: ${persisted.record.latest_audit_path ?? "-"}`,
      `next: reuse this thought_id with thought show/history/reflect/delete or dsl audit --id`,
    ].join("\n") + "\n"
  );
}

export function formatThoughtSummary(snapshot: ThoughtSnapshot): string {
  const semanticAuditOverview = buildSemanticAuditOverview(snapshot);
  return (
    [
      `thought: ${snapshot.record.id}`,
      `status: ${snapshot.record.status}`,
      `derived_from: ${snapshot.record.derived_from ?? "-"}`,
      `created_at: ${snapshot.record.created_at}`,
      `updated_at: ${snapshot.record.updated_at}`,
      `draft: ${snapshot.record.current_draft_path ?? "-"}`,
      `final: ${snapshot.record.final_path ?? "-"}`,
      `latest_audit: ${snapshot.record.latest_audit_path ?? "-"}`,
      `semantic_audit: ${snapshot.semanticAuditText ? "present" : "-"}`,
      `semantic_audit_pairs: ${semanticAuditOverview.entries.length}`,
      `semantic_audit_unreviewed_pairs: ${semanticAuditOverview.unreviewedPairs.length}`,
      `reflection_count: ${snapshot.reflections.length}`,
      `latest_reflection_kind: ${snapshot.reflections.at(-1)?.kind ?? "-"}`,
      `history_events: ${snapshot.history.length}`,
    ].join("\n") + "\n"
  );
}

export function formatThoughtHistory(history: ThoughtEvent[]): string {
  if (history.length === 0) {
    return "No history yet.\n";
  }
  return (
    history
      .map((event) => {
        const pathText = event.path ? ` (${event.path})` : "";
        return `- ${event.at} [${event.kind}] ${event.summary}${pathText}`;
      })
      .join("\n") + "\n"
  );
}

export function formatThoughtList(records: ThoughtRecord[]): string {
  if (records.length === 0) {
    return "No persisted thoughts.\n";
  }
  return (
    records
      .map(
        (thought) =>
          `- ${thought.id} [${thought.status}] updated_at=${thought.updated_at}`,
      )
      .join("\n") + "\n"
  );
}

export function formatThoughtReflections(
  reflections: ThoughtReflection[],
): string {
  if (reflections.length === 0) {
    return "No reflections yet.\n";
  }
  return (
    reflections
      .map(
        (reflection) =>
          `- ${reflection.at} [${reflection.kind}] ${reflection.text}`,
      )
      .join("\n") + "\n"
  );
}

export function formatThoughtSemanticAuditSummary(snapshot: ThoughtSnapshot): string {
  const overview = buildSemanticAuditOverview(snapshot);
  if (!snapshot.semanticAuditText) {
    return "No semantic audit yet.\n";
  }

  return (
    [
      "semantic_audit: present",
      `reviewed_pairs: ${overview.entries.length}`,
      `supported_pairs: ${verdictCount(overview.entries, "supported")}`,
      `unsupported_pairs: ${verdictCount(overview.entries, "unsupported")}`,
      `mixed_pairs: ${verdictCount(overview.entries, "mixed")}`,
      `unknown_pairs: ${verdictCount(overview.entries, "unknown")}`,
      `unreviewed_pairs: ${overview.unreviewedPairs.length}`,
    ].join("\n") + "\n"
  );
}

export function formatThoughtSemanticAuditPairs(snapshot: ThoughtSnapshot): string {
  const overview = buildSemanticAuditOverview(snapshot);
  if (!snapshot.semanticAuditText) {
    return "No semantic audit yet.\n";
  }

  const lines: string[] = [];
  for (const entry of overview.entries) {
    const reason = entry.reason ? ` reason=${entry.reason}` : "";
    lines.push(`- ${entry.auditId} ${entry.decisionId}<-${entry.supportId} [${entry.verdict}]${reason}`);
  }

  if (overview.unreviewedPairs.length > 0) {
    lines.push("");
    lines.push("unreviewed_pairs:");
    for (const pair of overview.unreviewedPairs) {
      lines.push(`- ${pair.decisionId}<-${pair.supportId}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function formatThoughtSearchResults(
  results: ThoughtSearchResult[],
): string {
  if (results.length === 0) {
    return "No thoughts matched.\n";
  }
  const lines = results.map((result) => {
    const explanation = result.explanation ? ` ${result.explanation}` : "";
    return `- ${result.id} [${result.source}/${result.status}] score=${result.score}${explanation} ${result.excerpt}`;
  });
  lines.push("");
  lines.push(
    "Next action: llmthink thought relate --id <new-thought-id> --from <matched-thought-id>",
  );
  return `${lines.join("\n")}\n`;
}
