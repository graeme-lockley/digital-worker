export function buildRunsQuery(params: {
  agentId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): string {
  const search = new URLSearchParams();
  if (params.agentId?.trim()) {
    search.set("agentId", params.agentId.trim());
  }
  if (params.status?.trim()) {
    search.set("status", params.status.trim());
  }
  if (params.limit !== undefined) {
    search.set("limit", String(params.limit));
  }
  if (params.offset !== undefined) {
    search.set("offset", String(params.offset));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export function formatTimestamp(ms: number | undefined): string {
  if (ms === undefined) {
    return "—";
  }
  return new Date(ms).toISOString();
}

export function formatDuration(
  startedAt: number,
  finishedAt: number | undefined,
): string {
  if (finishedAt === undefined) {
    return "running";
  }
  const seconds = Math.max(0, Math.round((finishedAt - startedAt) / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return `${minutes}m ${rem}s`;
}

export function excerpt(text: string, max = 120): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max)}…`;
}

export function shouldAutoRefresh(runs: Array<{ status: string }>): boolean {
  return runs.some((run) => run.status === "running");
}

export type SchedulerView = "schedules" | "runs" | "run-detail" | "event-detail";

export function parseViewHash(hash: string): {
  view: SchedulerView;
  id?: string;
} {
  const trimmed = hash.replace(/^#/, "").trim();
  if (!trimmed || trimmed === "schedules") {
    return { view: "schedules" };
  }
  if (trimmed === "runs") {
    return { view: "runs" };
  }
  if (trimmed.startsWith("run/")) {
    return { view: "run-detail", id: trimmed.slice(4) };
  }
  if (trimmed.startsWith("event/")) {
    return { view: "event-detail", id: trimmed.slice(6) };
  }
  return { view: "schedules" };
}
