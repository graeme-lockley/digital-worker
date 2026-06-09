import type { AgentTool } from "@earendil-works/pi-agent-core";
import {
  SCHEDULER_PATHS,
  type CreateEventRequest,
  type CreateEventResponse,
  type EventDetailResponse,
  type ListEventsResponse,
  type ListRunsResponse,
  type ScheduledEvent,
  type ScheduledRunSummary,
} from "@digital-worker/agent-scheduler-protocol";
import { Type } from "typebox";

export type SchedulerClientDeps = {
  schedulerUrl: string;
  agentId: string;
  telegramBotId?: string;
  fetchFn?: typeof fetch;
};

export function createScheduleEventTool(
  deps: SchedulerClientDeps,
): AgentTool<typeof scheduleEventParameters> {
  return {
    name: "schedule_event",
    label: "Schedule Event",
    description:
      "Create a durable scheduled agent turn (one-shot or recurring cron). Runs survive restarts; use list_scheduled_runs to inspect transcripts.",
    parameters: scheduleEventParameters,
    execute: async (_toolCallId, params) => {
      const fetchFn = deps.fetchFn ?? fetch;
      const url = new URL(SCHEDULER_PATHS.events, deps.schedulerUrl);
      const body: CreateEventRequest = {
        agentId: params.agentId?.trim() || deps.agentId,
        model: params.model.trim(),
        prompt: params.prompt.trim(),
        createdBy: deps.agentId,
        cron: params.cron?.trim(),
        fireAt: params.fireAt?.trim(),
        timezone: params.timezone?.trim(),
        missedPolicy: params.missedPolicy,
        internalOnly: params.internalOnly === true,
        deliverTo:
          params.deliverToChannel?.trim()
            ? {
                channel: params.deliverToChannel.trim(),
                threadId: params.deliverToThreadId?.trim(),
                botId:
                  params.deliverToChannel.trim() === "telegram"
                    ? deps.telegramBotId?.trim()
                    : undefined,
              }
            : undefined,
      };

      const response = await fetchFn(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const detail = await readErrorMessage(response);
        return {
          content: [{ type: "text", text: `schedule_event failed: ${detail}` }],
          details: { error: detail },
        };
      }

      const payload = (await response.json()) as CreateEventResponse;
      const event = payload.event;
      const schedule = event.cron
        ? `cron ${event.cron} (${event.timezone})`
        : `one-shot at ${new Date(event.fireAt).toISOString()}`;

      return {
        content: [
          {
            type: "text",
            text: `Scheduled event ${event.id} for agent ${event.agentId} with model ${event.model}. ${schedule}. Next fire: ${new Date(event.fireAt).toISOString()}.`,
          },
        ],
        details: payload,
      };
    },
  };
}

export function createListScheduledEventsTool(
  deps: SchedulerClientDeps,
): AgentTool<typeof listScheduledEventsParameters> {
  return {
    name: "list_scheduled_events",
    label: "List Scheduled Events",
    description:
      "List durable scheduled events for this agent (active, paused, completed, cancelled).",
    parameters: listScheduledEventsParameters,
    execute: async (_toolCallId, params) => {
      const fetchFn = deps.fetchFn ?? fetch;
      const url = new URL(SCHEDULER_PATHS.events, deps.schedulerUrl);
      url.searchParams.set("agentId", deps.agentId);
      if (params.status?.trim()) {
        url.searchParams.set("status", params.status.trim());
      }

      const response = await fetchFn(url);
      if (!response.ok) {
        const detail = await readErrorMessage(response);
        return {
          content: [
            { type: "text", text: `list_scheduled_events failed: ${detail}` },
          ],
          details: { error: detail },
        };
      }

      const body = (await response.json()) as ListEventsResponse;
      if (body.events.length === 0) {
        return {
          content: [{ type: "text", text: "No scheduled events." }],
          details: body,
        };
      }

      const formatted = body.events
        .map((event: ScheduledEvent, index: number) => {
          const schedule = event.cron
            ? `cron ${event.cron}`
            : `fireAt ${new Date(event.fireAt).toISOString()}`;
          return `${index + 1}. ${event.id} [${event.status}] model=${event.model}\n   ${schedule}\n   next: ${new Date(event.fireAt).toISOString()}\n   ${event.prompt.slice(0, 120)}${event.prompt.length > 120 ? "…" : ""}`;
        })
        .join("\n\n");

      return {
        content: [
          {
            type: "text",
            text: `${body.events.length} scheduled event(s):\n\n${formatted}`,
          },
        ],
        details: body,
      };
    },
  };
}

export function createListScheduledRunsTool(
  deps: SchedulerClientDeps,
): AgentTool<typeof listScheduledRunsParameters> {
  return {
    name: "list_scheduled_runs",
    label: "List Scheduled Runs",
    description:
      "List run history for a scheduled event (status, transcript excerpt, errors).",
    parameters: listScheduledRunsParameters,
    execute: async (_toolCallId, params) => {
      const fetchFn = deps.fetchFn ?? fetch;
      const eventId = params.eventId.trim();
      const url = new URL(
        `${SCHEDULER_PATHS.events}/${encodeURIComponent(eventId)}/runs`,
        deps.schedulerUrl,
      );
      if (params.limit !== undefined) {
        url.searchParams.set("limit", String(params.limit));
      }
      if (params.offset !== undefined) {
        url.searchParams.set("offset", String(params.offset));
      }

      const response = await fetchFn(url);
      if (!response.ok) {
        const detail = await readErrorMessage(response);
        return {
          content: [
            { type: "text", text: `list_scheduled_runs failed: ${detail}` },
          ],
          details: { error: detail },
        };
      }

      const body = (await response.json()) as ListRunsResponse;
      if (body.runs.length === 0) {
        return {
          content: [{ type: "text", text: `No runs for event ${eventId}.` }],
          details: body,
        };
      }

      const formatted = body.runs
        .map((run: ScheduledRunSummary, index: number) => {
          const excerpt = run.transcript.slice(0, 160);
          return `${index + 1}. ${run.id} [${run.status}] attempt=${run.attempt}\n   scheduled: ${new Date(run.scheduledFor).toISOString()}\n   ${excerpt}${run.transcript.length > 160 ? "…" : ""}${run.error ? `\n   error: ${run.error}` : ""}`;
        })
        .join("\n\n");

      return {
        content: [
          {
            type: "text",
            text: `${body.runs.length} run(s) for ${eventId}:\n\n${formatted}`,
          },
        ],
        details: body,
      };
    },
  };
}

export function createCancelScheduledEventTool(
  deps: SchedulerClientDeps,
): AgentTool<typeof cancelScheduledEventParameters> {
  return {
    name: "cancel_scheduled_event",
    label: "Cancel Scheduled Event",
    description: "Cancel a durable scheduled event so it will not fire again.",
    parameters: cancelScheduledEventParameters,
    execute: async (_toolCallId, params) => {
      const fetchFn = deps.fetchFn ?? fetch;
      const eventId = params.eventId.trim();
      const url = new URL(
        `${SCHEDULER_PATHS.events}/${encodeURIComponent(eventId)}`,
        deps.schedulerUrl,
      );

      const response = await fetchFn(url, { method: "DELETE" });
      if (!response.ok) {
        const detail = await readErrorMessage(response);
        return {
          content: [
            { type: "text", text: `cancel_scheduled_event failed: ${detail}` },
          ],
          details: { error: detail },
        };
      }

      const body = (await response.json()) as EventDetailResponse;
      return {
        content: [
          {
            type: "text",
            text: `Cancelled scheduled event ${eventId} (status ${body.event.status}).`,
          },
        ],
        details: body,
      };
    },
  };
}

async function readErrorMessage(response: Response): Promise<string> {
  let detail = `${response.status}`;
  try {
    const payload = (await response.json()) as {
      error?: { message?: string };
    };
    if (payload.error?.message) {
      detail = payload.error.message;
    }
  } catch {
    // ignore
  }
  return detail;
}

const scheduleEventParameters = Type.Object({
  prompt: Type.String({
    description: "Prompt to send when the event fires",
    minLength: 1,
    maxLength: 32000,
  }),
  model: Type.String({
    description: "Model id or provider/model from the agent roster",
    minLength: 1,
    maxLength: 200,
  }),
  fireAt: Type.Optional(
    Type.String({
      description: "ISO-8601 one-shot fire time (mutually exclusive with cron)",
      minLength: 1,
      maxLength: 64,
    }),
  ),
  cron: Type.Optional(
    Type.String({
      description: "Standard 5-field cron for recurring schedules",
      minLength: 1,
      maxLength: 100,
    }),
  ),
  timezone: Type.Optional(
    Type.String({
      description: "IANA timezone (required when cron is set; default UTC)",
      minLength: 1,
      maxLength: 64,
    }),
  ),
  missedPolicy: Type.Optional(
    Type.Union([Type.Literal("fire-once"), Type.Literal("skip")], {
      description: "Behaviour when overdue after restart (default fire-once)",
    }),
  ),
  agentId: Type.Optional(
    Type.String({
      description: "Target agent id (default: self)",
      minLength: 1,
      maxLength: 100,
    }),
  ),
  internalOnly: Type.Optional(
    Type.Boolean({
      description:
        "When true, skip delivery suffix and scheduler fallback (internal/background task)",
    }),
  ),
  deliverToChannel: Type.Optional(
    Type.String({
      description:
        'Fallback delivery channel if the agent does not send_message (e.g. "telegram")',
      minLength: 1,
      maxLength: 50,
    }),
  ),
  deliverToThreadId: Type.Optional(
    Type.String({
      description: "Fallback delivery thread/chat id (e.g. Telegram chat id)",
      maxLength: 100,
    }),
  ),
});

const listScheduledEventsParameters = Type.Object({
  status: Type.Optional(
    Type.String({
      description: "Filter by status (active, paused, completed, cancelled)",
      maxLength: 20,
    }),
  ),
});

const listScheduledRunsParameters = Type.Object({
  eventId: Type.String({
    description: "Scheduled event id",
    minLength: 1,
    maxLength: 100,
  }),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  offset: Type.Optional(Type.Integer({ minimum: 0 })),
});

const cancelScheduledEventParameters = Type.Object({
  eventId: Type.String({
    description: "Scheduled event id to cancel",
    minLength: 1,
    maxLength: 100,
  }),
});
