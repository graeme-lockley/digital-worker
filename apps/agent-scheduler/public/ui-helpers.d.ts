export type ScheduleSortColumn =
  | "agent"
  | "status"
  | "schedule"
  | "fireAt"
  | "model"
  | "prompt";

export type ScheduleSortState = {
  column: ScheduleSortColumn;
  direction: "asc" | "desc";
};

export type ScheduleEventRow = {
  id?: string;
  agentId?: string;
  status?: string;
  cron?: string;
  timezone?: string;
  fireAt?: number;
  model?: string;
  prompt?: string;
};

export declare const DEFAULT_SCHEDULE_SORT: ScheduleSortState;

export declare function buildEventsQuery(params: {
  agentId?: string;
  status?: string;
}): string;

export declare function sortScheduleEvents(
  events: ScheduleEventRow[],
  sort: ScheduleSortState,
): ScheduleEventRow[];

export declare function nextScheduleSort(
  current: ScheduleSortState,
  column: ScheduleSortColumn,
): ScheduleSortState;
