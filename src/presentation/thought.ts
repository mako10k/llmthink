import type {
  ThoughtEvent,
  ThoughtReflection,
  ThoughtRecord,
  ThoughtSearchResult,
  ThoughtSnapshot,
} from "../thought/store.js";

export function formatThoughtSummary(snapshot: ThoughtSnapshot): string {
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
