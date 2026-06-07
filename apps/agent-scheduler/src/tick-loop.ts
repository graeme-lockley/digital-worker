import { AGENT_STATUS } from "@digital-worker/agent-register-protocol";
import type { ScheduledEvent } from "@digital-worker/agent-scheduler-protocol";

import {
  AgentResolverError,
  ModelValidationError,
  resolveAgent,
  validateModel,
} from "./agent-resolver.js";
import { ChatFireError, fireChat } from "./chat-fire-client.js";
import { computeNextFireAt } from "./cron.js";
import { detectDeliveryInTranscript } from "./delivery.js";
import { GatewayOutboundError, postGatewayOutbound } from "./gateway-outbound.js";
import type { SchedulerStore } from "./store/scheduler-store.js";

const SLEEPING_BACKOFF_MS = [30_000, 60_000, 300_000] as const;
const FAILURE_BACKOFF_MS = [30_000, 60_000, 300_000, 900_000, 1_800_000] as const;
const MAX_FAILURE_ATTEMPTS = 5;

export type TickLoopDeps = {
  store: SchedulerStore;
  registerUrl: string;
  leaseMs: number;
  clientId: string;
  chatTimeoutMs: number;
  /** When set, enables fallback Telegram delivery via agent-gateway outbound. */
  gatewayUrl?: string;
  fetchFn?: typeof fetch;
  onError?: (error: unknown, context: { eventId: string }) => void;
};

export class TickLoop {
  private timer?: ReturnType<typeof setInterval>;
  private ticking = false;
  private readonly sleepingRetries = new Map<string, number>();
  private readonly fetchFn: typeof fetch;

  constructor(private readonly deps: TickLoopDeps) {
    this.fetchFn = deps.fetchFn ?? fetch;
  }

  start(intervalMs: number): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.tick().catch((error) => {
        console.error("tick loop error:", error);
      });
    }, intervalMs);
    void this.tick().catch((error) => {
      console.error("initial tick error:", error);
    });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async tick(): Promise<void> {
    if (this.ticking) {
      return;
    }
    this.ticking = true;
    try {
      const now = Date.now();
      await this.deps.store.recoverStaleLeases(now);
      const due = await this.deps.store.claimDueEvents(now, this.deps.leaseMs);
      for (const event of due) {
        await this.processEvent(event, now);
      }
    } finally {
      this.ticking = false;
    }
  }

  private async processEvent(event: ScheduledEvent, now: number): Promise<void> {
    try {
      if (await this.deps.store.hasRunningRun(event.id)) {
        await this.rescheduleOverlap(event, now);
        return;
      }

      const agent = await resolveAgent(
        this.deps.registerUrl,
        event.agentId,
        this.fetchFn,
      );

      if (agent.status === AGENT_STATUS.SLEEPING) {
        await this.rescheduleSleeping(event, now);
        return;
      }

      try {
        await validateModel(agent.endpoint.url, event.model, this.fetchFn);
      } catch (error) {
        const message =
          error instanceof ModelValidationError
            ? error.message
            : "model validation failed";
        await this.failEvent(event, now, message);
        return;
      }

      const scheduledFor = event.fireAt;
      const attempt =
        (await this.deps.store.countConsecutiveFailures(event.id)) + 1;
      const run = await this.deps.store.createRun({
        id: crypto.randomUUID(),
        eventId: event.id,
        scheduledFor,
        startedAt: now,
        model: event.model,
        attempt,
      });

      let result;
      try {
        result = await fireChat({
          agentBaseUrl: agent.endpoint.url,
          clientId: this.deps.clientId,
          prompt: event.prompt,
          model: event.model,
          timeoutMs: this.deps.chatTimeoutMs,
          fetchFn: this.fetchFn,
          onToken: (chunk) => {
            void this.deps.store.appendTranscript(run.id, chunk);
          },
        });
      } catch (error) {
        const message =
          error instanceof ChatFireError
            ? error.message
            : error instanceof Error
              ? error.message
              : "chat fire failed";
        await this.deps.store.finishRun(run.id, "failed", Date.now(), message);
        await this.scheduleFailureRetry(event, now, attempt, message);
        return;
      }

      if (result.error) {
        await this.deps.store.finishRun(run.id, "failed", Date.now(), result.error);
        await this.scheduleFailureRetry(event, now, attempt, result.error);
        return;
      }

      await this.deps.store.finishRun(run.id, "succeeded", Date.now());
      this.sleepingRetries.delete(event.id);

      await this.maybeDeliverFallback(event, run.id, result.transcript);

      if (event.cron) {
        const nextFireAt = computeNextFireAt(
          event.cron,
          event.timezone,
          Date.now(),
        );
        await this.deps.store.advanceEvent(event.id, { nextFireAt }, now);
      } else {
        await this.deps.store.advanceEvent(event.id, { completed: true }, now);
      }
    } catch (error) {
      this.deps.onError?.(error, { eventId: event.id });
      if (error instanceof AgentResolverError) {
        await this.failEvent(event, now, error.message);
        return;
      }
      console.error(`failed to process event ${event.id}:`, error);
      await this.deps.store.releaseLease(event.id, Date.now());
    } finally {
      await this.deps.store.releaseLease(event.id, Date.now());
    }
  }

  private async rescheduleOverlap(event: ScheduledEvent, now: number): Promise<void> {
    const nextFireAt = event.cron
      ? computeNextFireAt(event.cron, event.timezone, now)
      : now + 60_000;
    await this.deps.store.setEventFireAt(event.id, nextFireAt, now);
    await this.deps.store.releaseLease(event.id, now);
  }

  private async rescheduleSleeping(event: ScheduledEvent, now: number): Promise<void> {
    const count = (this.sleepingRetries.get(event.id) ?? 0) + 1;
    this.sleepingRetries.set(event.id, count);
    const index = Math.min(count - 1, SLEEPING_BACKOFF_MS.length - 1);
    const delay = SLEEPING_BACKOFF_MS[index]!;
    await this.deps.store.setEventFireAt(event.id, now + delay, now);
    await this.deps.store.releaseLease(event.id, now);
  }

  private async scheduleFailureRetry(
    event: ScheduledEvent,
    now: number,
    attempt: number,
    message: string,
  ): Promise<void> {
    if (attempt >= MAX_FAILURE_ATTEMPTS) {
      if (event.cron) {
        const nextFireAt = computeNextFireAt(
          event.cron,
          event.timezone,
          now,
        );
        await this.deps.store.advanceEvent(event.id, { nextFireAt }, now);
      } else {
        await this.deps.store.setEventFireAt(event.id, now + 3_600_000, now);
      }
      console.error(
        `event ${event.id} exceeded max fire attempts; last error: ${message}`,
      );
      return;
    }

    const index = Math.min(attempt - 1, FAILURE_BACKOFF_MS.length - 1);
    const delay = FAILURE_BACKOFF_MS[index]!;
    await this.deps.store.setEventFireAt(event.id, now + delay, now);
  }

  private async failEvent(
    event: ScheduledEvent,
    now: number,
    message: string,
  ): Promise<void> {
    const attempt = (await this.deps.store.countConsecutiveFailures(event.id)) + 1;
    const run = await this.deps.store.createRun({
      id: crypto.randomUUID(),
      eventId: event.id,
      scheduledFor: event.fireAt,
      startedAt: now,
      model: event.model,
      attempt,
    });
    await this.deps.store.finishRun(run.id, "failed", now, message);
    await this.scheduleFailureRetry(event, now, attempt, message);
  }

  private async maybeDeliverFallback(
    event: ScheduledEvent,
    runId: string,
    transcript: string,
  ): Promise<void> {
    const deliverTo = event.deliverTo;
    if (
      event.internalOnly ||
      !deliverTo?.channel?.trim() ||
      !this.deps.gatewayUrl?.trim()
    ) {
      return;
    }

    if (detectDeliveryInTranscript(transcript)) {
      return;
    }

    const text = transcript.trim();
    if (!text) {
      return;
    }

    try {
      const result = await postGatewayOutbound(
        this.deps.gatewayUrl,
        {
          channel: deliverTo.channel.trim(),
          text,
          threadId: deliverTo.threadId?.trim(),
        },
        this.fetchFn,
      );
      if (result.delivered) {
        await this.deps.store.markRunDeliverFallback(runId);
      }
    } catch (error) {
      const message =
        error instanceof GatewayOutboundError
          ? error.message
          : error instanceof Error
            ? error.message
            : "fallback delivery failed";
      console.error(`fallback delivery for run ${runId}: ${message}`);
    }
  }
}
