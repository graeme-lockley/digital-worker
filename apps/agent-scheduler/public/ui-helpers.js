/** @typedef {'agent' | 'status' | 'schedule' | 'fireAt' | 'model' | 'prompt'} ScheduleSortColumn */

/** @typedef {{ column: ScheduleSortColumn; direction: 'asc' | 'desc' }} ScheduleSortState */

export const DEFAULT_SCHEDULE_SORT = /** @type {ScheduleSortState} */ ({
  column: "fireAt",
  direction: "asc",
});

/**
 * @param {{ agentId?: string; status?: string }} params
 */
export function buildEventsQuery(params) {
  const search = new URLSearchParams();
  if (params.agentId?.trim()) {
    search.set("agentId", params.agentId.trim());
  }
  if (params.status?.trim()) {
    search.set("status", params.status.trim());
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

/**
 * @param {ScheduleSortColumn} column
 * @param {Record<string, unknown>} event
 */
export function scheduleSortValue(column, event) {
  switch (column) {
    case "agent":
      return String(event.agentId ?? "");
    case "status":
      return String(event.status ?? "");
    case "schedule":
      return event.cron
        ? `cron:${String(event.cron)}:${String(event.timezone ?? "")}`
        : `once:${String(event.fireAt ?? 0)}`;
    case "fireAt":
      return typeof event.fireAt === "number" ? event.fireAt : 0;
    case "model":
      return String(event.model ?? "");
    case "prompt":
      return String(event.prompt ?? "");
    default:
      return "";
  }
}

/**
 * @param {Array<Record<string, unknown>>} events
 * @param {ScheduleSortState} sort
 */
export function sortScheduleEvents(events, sort) {
  const direction = sort.direction === "desc" ? -1 : 1;
  const column = sort.column;

  return [...events].sort((left, right) => {
    const a = scheduleSortValue(column, left);
    const b = scheduleSortValue(column, right);

    if (typeof a === "number" && typeof b === "number") {
      return (a - b) * direction;
    }

    return String(a).localeCompare(String(b), undefined, {
      sensitivity: "base",
      numeric: true,
    }) * direction;
  });
}

/**
 * @param {ScheduleSortState} current
 * @param {ScheduleSortColumn} column
 */
export function nextScheduleSort(current, column) {
  if (current.column === column) {
    return {
      column,
      direction: current.direction === "asc" ? "desc" : "asc",
    };
  }
  return { column, direction: "asc" };
}
