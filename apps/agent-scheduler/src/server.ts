import { serve } from "@hono/node-server";
import { Hono } from "hono";

import {
  SCHEDULER_ERROR_CODES,
  SCHEDULER_PATHS,
  isMissedFirePolicy,
  isScheduledEventStatus,
  isScheduledRunStatus,
  type CreateEventRequest,
  type CreateEventResponse,
  type EventDetailResponse,
  type ListEventsResponse,
  type ListRunsResponse,
  type ListSchedulerAgentsResponse,
  type RunDetailResponse,
  type ScheduledEvent,
  type ScheduledRunSummary,
} from "@digital-worker/agent-scheduler-protocol";

import {
  AgentResolverError,
  ModelValidationError,
  fetchRegisteredAgents,
  resolveAgent,
  validateModel,
} from "./agent-resolver.js";
import { InvalidCronError, computeInitialFireAt, validateCron } from "./cron.js";
import { appendDeliveryPrompt } from "./delivery.js";
import { registerStaticRoutes } from "./static.js";
import { enrichRun, enrichRunSummary } from "./run-enrichment.js";
import type { SchedulerStore } from "./store/scheduler-store.js";
import type { TickLoop } from "./tick-loop.js";

export type SchedulerContext = {
  store: SchedulerStore;
  registerUrl: string;
  tickLoop: TickLoop;
};

export function createApp(ctx: SchedulerContext): Hono {
  const app = new Hono();

  registerStaticRoutes(app);

  app.get(SCHEDULER_PATHS.health, (c) => c.json({ status: "ok" }));

  app.post(SCHEDULER_PATHS.events, async (c) => {
    let body: CreateEventRequest;
    try {
      body = await c.req.json<CreateEventRequest>();
    } catch {
      return apiError(c, SCHEDULER_ERROR_CODES.INVALID_REQUEST, "invalid JSON body", 400);
    }

    const validation = validateCreateEvent(body);
    if ("error" in validation) {
      return apiError(
        c,
        validation.error.code,
        validation.error.message,
        validation.error.status,
      );
    }

    const input = validation.value;
    try {
      await resolveAgent(ctx.registerUrl, input.agentId);
    } catch (error) {
      const message =
        error instanceof AgentResolverError ? error.message : "agent lookup failed";
      return apiError(c, SCHEDULER_ERROR_CODES.AGENT_NOT_FOUND, message, 404);
    }

    try {
      const agent = await resolveAgent(ctx.registerUrl, input.agentId);
      await validateModel(agent.endpoint.url, input.model);
    } catch (error) {
      const message =
        error instanceof ModelValidationError
          ? error.message
          : error instanceof AgentResolverError
            ? error.message
            : "model validation failed";
      const code =
        error instanceof AgentResolverError
          ? SCHEDULER_ERROR_CODES.AGENT_NOT_FOUND
          : SCHEDULER_ERROR_CODES.MODEL_NOT_FOUND;
      return apiError(c, code, message, 400);
    }

    const now = Date.now();
    const event = await ctx.store.createEvent({
      id: crypto.randomUUID(),
      agentId: input.agentId,
      model: input.model,
      prompt: input.prompt,
      cron: input.cron,
      fireAt: input.fireAt,
      timezone: input.timezone,
      missedPolicy: input.missedPolicy,
      createdBy: input.createdBy,
      internalOnly: input.internalOnly,
      deliverChannel: input.deliverChannel,
      deliverThreadId: input.deliverThreadId,
      now,
    });

    const response: CreateEventResponse = { event };
    return c.json(response, 201);
  });

  app.get(SCHEDULER_PATHS.events, async (c) => {
    const agentId = c.req.query("agentId")?.trim();
    const statusRaw = c.req.query("status")?.trim();
    const status =
      statusRaw && isScheduledEventStatus(statusRaw) ? statusRaw : undefined;
    if (statusRaw && !status) {
      return apiError(
        c,
        SCHEDULER_ERROR_CODES.INVALID_REQUEST,
        "invalid status filter",
        400,
      );
    }

    const events = await ctx.store.listEvents({
      agentId: agentId || undefined,
      status,
    });
    const response: ListEventsResponse = { events };
    return c.json(response);
  });

  app.get(`${SCHEDULER_PATHS.events}/:id`, async (c) => {
    const event = await ctx.store.getEvent(c.req.param("id"));
    if (!event) {
      return apiError(c, SCHEDULER_ERROR_CODES.NOT_FOUND, "event not found", 404);
    }
    const { runs } = await ctx.store.listRuns({
      eventId: event.id,
      limit: 10,
      offset: 0,
    });
    const response: EventDetailResponse = {
      event,
      recentRuns: runs.map((run) => presentRunSummary(run)),
    };
    return c.json(response);
  });

  app.delete(`${SCHEDULER_PATHS.events}/:id`, async (c) => {
    const event = await ctx.store.cancelEvent(c.req.param("id"), Date.now());
    if (!event) {
      return apiError(c, SCHEDULER_ERROR_CODES.NOT_FOUND, "event not found", 404);
    }
    const { runs } = await ctx.store.listRuns({
      eventId: event.id,
      limit: 10,
      offset: 0,
    });
    const response: EventDetailResponse = {
      event,
      recentRuns: runs.map((run) => presentRunSummary(run)),
    };
    return c.json(response);
  });

  app.post(`${SCHEDULER_PATHS.events}/:id/pause`, async (c) => {
    const event = await ctx.store.pauseEvent(c.req.param("id"), Date.now());
    if (!event) {
      return apiError(c, SCHEDULER_ERROR_CODES.NOT_FOUND, "event not found", 404);
    }
    const { runs } = await ctx.store.listRuns({
      eventId: event.id,
      limit: 10,
      offset: 0,
    });
    const response: EventDetailResponse = {
      event,
      recentRuns: runs.map((run) => presentRunSummary(run)),
    };
    return c.json(response);
  });

  app.post(`${SCHEDULER_PATHS.events}/:id/resume`, async (c) => {
    const existing = await ctx.store.getEvent(c.req.param("id"));
    if (!existing) {
      return apiError(c, SCHEDULER_ERROR_CODES.NOT_FOUND, "event not found", 404);
    }

    const now = Date.now();
    const nextFireAt = existing.cron
      ? computeInitialFireAt(existing.cron, existing.timezone)
      : Math.max(existing.fireAt, now);
    const event = await ctx.store.resumeEvent(existing.id, nextFireAt, now);
    if (!event) {
      return apiError(c, SCHEDULER_ERROR_CODES.NOT_FOUND, "event not found", 404);
    }
    const { runs } = await ctx.store.listRuns({
      eventId: event.id,
      limit: 10,
      offset: 0,
    });
    const response: EventDetailResponse = {
      event,
      recentRuns: runs.map((run) => presentRunSummary(run)),
    };
    return c.json(response);
  });

  app.get(`${SCHEDULER_PATHS.events}/:id/runs`, async (c) => {
    const event = await ctx.store.getEvent(c.req.param("id"));
    if (!event) {
      return apiError(c, SCHEDULER_ERROR_CODES.NOT_FOUND, "event not found", 404);
    }

    const limit = parseLimit(c.req.query("limit"), 50);
    const offset = parseOffset(c.req.query("offset"));
    const statusRaw = c.req.query("status")?.trim();
    const status =
      statusRaw && isScheduledRunStatus(statusRaw) ? statusRaw : undefined;
    if (statusRaw && !status) {
      return apiError(
        c,
        SCHEDULER_ERROR_CODES.INVALID_REQUEST,
        "invalid status filter",
        400,
      );
    }

    const { runs, total } = await ctx.store.listRuns({
      eventId: event.id,
      status,
      limit,
      offset,
    });
    const response: ListRunsResponse = {
      runs: runs.map((run) => presentRunSummary(run)),
      total,
    };
    return c.json(response);
  });

  app.get(SCHEDULER_PATHS.runs, async (c) => {
    const limit = parseLimit(c.req.query("limit"), 50);
    const offset = parseOffset(c.req.query("offset"));
    const agentId = c.req.query("agentId")?.trim();
    const statusRaw = c.req.query("status")?.trim();
    const status =
      statusRaw && isScheduledRunStatus(statusRaw) ? statusRaw : undefined;
    if (statusRaw && !status) {
      return apiError(
        c,
        SCHEDULER_ERROR_CODES.INVALID_REQUEST,
        "invalid status filter",
        400,
      );
    }

    const { runs, total } = await ctx.store.listRuns({
      agentId: agentId || undefined,
      status,
      limit,
      offset,
    });
    const response: ListRunsResponse = {
      runs: runs.map((run) => presentRunSummary(run)),
      total,
    };
    return c.json(response);
  });

  app.get(`${SCHEDULER_PATHS.runs}/:id`, async (c) => {
    const detail = await ctx.store.getRunWithEvent(c.req.param("id"));
    if (!detail) {
      return apiError(c, SCHEDULER_ERROR_CODES.NOT_FOUND, "run not found", 404);
    }
    const response: RunDetailResponse = {
      run: enrichRun(detail.run, detail.event),
      event: detail.event,
    };
    return c.json(response);
  });

  app.get(SCHEDULER_PATHS.agents, async (c) => {
    const agentIds = await ctx.store.listDistinctAgentIds();
    let registerAgents: Awaited<ReturnType<typeof fetchRegisteredAgents>> = [];
    try {
      registerAgents = await fetchRegisteredAgents(ctx.registerUrl);
    } catch {
      // optional enrichment when register is unavailable
    }

    const response: ListSchedulerAgentsResponse = {
      agents: agentIds.map((agentId) => {
        const registered = registerAgents.find((agent) => agent.agentId === agentId);
        return {
          agentId,
          name: registered?.name,
        };
      }),
    };
    return c.json(response);
  });

  return app;
}

export function startServer(
  host: string,
  port: number,
  ctx: SchedulerContext,
  onReady?: () => void,
): void {
  const app = createApp(ctx);
  serve(
    {
      fetch: app.fetch,
      hostname: host,
      port,
    },
    onReady,
  );
}

function validateCreateEvent(body: CreateEventRequest):
  | {
      value: {
        agentId: string;
        model: string;
        prompt: string;
        cron?: string;
        fireAt: number;
        timezone: string;
        missedPolicy: "fire-once" | "skip";
        createdBy: string;
        internalOnly: boolean;
        deliverChannel?: string;
        deliverThreadId?: string;
      };
    }
  | { error: { code: string; message: string; status: number } } {
  const agentId = body.agentId?.trim();
  const model = body.model?.trim();
  const prompt = body.prompt?.trim();
  const createdBy = body.createdBy?.trim();
  const cron = body.cron?.trim();
  const fireAtRaw = body.fireAt?.trim();

  if (!agentId || !model || !prompt || !createdBy) {
    return {
      error: {
        code: SCHEDULER_ERROR_CODES.INVALID_REQUEST,
        message: "agentId, model, prompt, and createdBy are required",
        status: 400,
      },
    };
  }

  const hasCron = Boolean(cron);
  const hasFireAt = Boolean(fireAtRaw);
  if (hasCron === hasFireAt) {
    return {
      error: {
        code: SCHEDULER_ERROR_CODES.INVALID_REQUEST,
        message: "exactly one of cron or fireAt is required",
        status: 400,
      },
    };
  }

  const missedPolicy = body.missedPolicy ?? "fire-once";
  if (!isMissedFirePolicy(missedPolicy)) {
    return {
      error: {
        code: SCHEDULER_ERROR_CODES.INVALID_REQUEST,
        message: "invalid missedPolicy",
        status: 400,
      },
    };
  }

  if (hasCron && cron) {
    try {
      validateCron(cron);
    } catch (error) {
      return {
        error: {
          code: SCHEDULER_ERROR_CODES.INVALID_CRON,
          message:
            error instanceof InvalidCronError ? error.message : "invalid cron",
          status: 400,
        },
      };
    }
  }

  const timezone = body.timezone?.trim() || "UTC";
  let fireAt: number;
  if (hasFireAt && fireAtRaw) {
    const parsed = Date.parse(fireAtRaw);
    if (Number.isNaN(parsed)) {
      return {
        error: {
          code: SCHEDULER_ERROR_CODES.INVALID_REQUEST,
          message: "fireAt must be a valid ISO-8601 timestamp",
          status: 400,
        },
      };
    }
    fireAt = parsed;
  } else if (cron) {
    try {
      fireAt = computeInitialFireAt(cron, timezone);
    } catch (error) {
      return {
        error: {
          code: SCHEDULER_ERROR_CODES.INVALID_CRON,
          message:
            error instanceof InvalidCronError ? error.message : "invalid cron",
          status: 400,
        },
      };
    }
  } else {
    return {
      error: {
        code: SCHEDULER_ERROR_CODES.INVALID_REQUEST,
        message: "missing schedule",
        status: 400,
      },
    };
  }

  const internalOnly = body.internalOnly === true;
  const deliverChannel = body.deliverTo?.channel?.trim();
  const deliverThreadId = body.deliverTo?.threadId?.trim();

  if (internalOnly && deliverChannel) {
    return {
      error: {
        code: SCHEDULER_ERROR_CODES.INVALID_REQUEST,
        message: "internalOnly events cannot specify deliverTo",
        status: 400,
      },
    };
  }

  const finalPrompt = appendDeliveryPrompt(prompt, internalOnly);

  return {
    value: {
      agentId,
      model,
      prompt: finalPrompt,
      cron: hasCron ? cron : undefined,
      fireAt,
      timezone,
      missedPolicy,
      createdBy,
      internalOnly,
      deliverChannel: deliverChannel || undefined,
      deliverThreadId: deliverThreadId || undefined,
    },
  };
}

function parseLimit(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 200) {
    return fallback;
  }
  return value;
}

function parseOffset(raw: string | undefined): number {
  if (!raw) {
    return 0;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    return 0;
  }
  return value;
}

function apiError(
  c: { json: (body: unknown, status?: number) => Response },
  code: string,
  message: string,
  status: number,
): Response {
  return c.json({ error: { code, message } }, status);
}

type RunSummaryRow = ScheduledRunSummary & {
  internalOnly?: boolean;
  deliverTo?: ScheduledEvent["deliverTo"];
};

function presentRunSummary(run: RunSummaryRow): ScheduledRunSummary {
  const { internalOnly, deliverTo, ...base } = run;
  return enrichRunSummary(base, { internalOnly, deliverTo });
}
