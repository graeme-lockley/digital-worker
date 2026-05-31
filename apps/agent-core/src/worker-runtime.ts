import type { Agent } from "@earendil-works/pi-agent-core";
import {
  AGENT_CORE_ERROR_CODES,
  CHAT_STREAM_EVENT,
  type ChatStreamEvent,
  type AbandonResult,
  type StatusResult,
} from "@digital-worker/agent-core-protocol";

import type { MemoryManager } from "./memory/index.js";

export type ChatJob = {
  id: string;
  messageId: string;
  clientId: string;
  prompt: string;
  sessionId: string;
  enqueueAt: number;
  emit: (event: ChatStreamEvent) => Promise<void>;
  signal: AbortSignal;
};

type PendingJob = ChatJob & {
  resolve: () => void;
  reject: (error: Error) => void;
};

/** Job failure after the chat stream already received an SSE error event. */
export class WorkerJobFailedError extends Error {
  readonly streamNotified: boolean;

  constructor(message: string, streamNotified = false) {
    super(message);
    this.name = "WorkerJobFailedError";
    this.streamNotified = streamNotified;
  }
}

export class WorkerRuntime {
  private readonly inbox: PendingJob[] = [];
  private readonly waiters: Array<() => void> = [];
  private readonly startedAt = Date.now();
  private loopPromise?: Promise<void>;
  private stopped = false;
  private currentJob?: PendingJob;
  private currentJobStartedAt?: number;
  private operatorAbandonRequested = false;

  constructor(
    private readonly agent: Agent,
    readonly sessionId: string,
    private readonly memoryManager?: MemoryManager,
  ) {}

  start(): void {
    if (this.loopPromise) {
      return;
    }
    this.loopPromise = this.runLoop();
  }

  async stop(): Promise<void> {
    if (this.memoryManager) {
      await this.memoryManager.runFlush("shutdown");
    }
    this.stopped = true;
    this.notifyWaiters();
    this.agent.abort();
    await this.loopPromise;
  }

  enqueue(job: ChatJob): Promise<void> {
    if (this.stopped) {
      return Promise.reject(new Error("worker runtime is stopped"));
    }

    return new Promise((resolve, reject) => {
      const pending: PendingJob = {
        ...job,
        resolve,
        reject,
      };
      this.inbox.push(pending);
      this.notifyWaiters();
    });
  }

  getStatus(): StatusResult {
    return {
      sessionId: this.sessionId,
      queueDepth: this.queueDepth,
      queuedCount: this.inbox.length,
      active: this.currentJob
        ? {
            jobId: this.currentJob.id,
            clientId: this.currentJob.clientId,
            runningForMs:
              Date.now() - (this.currentJobStartedAt ?? Date.now()),
          }
        : null,
      uptimeMs: Date.now() - this.startedAt,
    };
  }

  abandon(): AbandonResult {
    let abandonedActive = false;
    let drainedQueued = 0;

    while (this.inbox.length > 0) {
      const job = this.inbox.shift();
      if (!job) {
        break;
      }
      drainedQueued += 1;
      void this.rejectJobWithStream(job, "abandoned by operator");
    }

    if (this.currentJob) {
      abandonedActive = true;
      this.operatorAbandonRequested = true;
      this.agent.abort();
    }

    return { abandonedActive, drainedQueued };
  }

  get queueDepth(): number {
    return this.inbox.length + (this.currentJob ? 1 : 0);
  }

  private notifyWaiters(): void {
    const waiters = this.waiters.splice(0);
    for (const wake of waiters) {
      wake();
    }
  }

  private async waitForWork(): Promise<void> {
    while (!this.stopped) {
      this.pruneCancelledJobs();
      if (this.inbox.length > 0) {
        return;
      }
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
      });
    }
  }

  private pruneCancelledJobs(): void {
    while (this.inbox.length > 0) {
      const next = this.inbox[0];
      if (!next?.signal.aborted) {
        break;
      }
      const cancelled = this.inbox.shift()!;
      cancelled.reject(new Error("request cancelled before processing"));
    }
  }

  private async rejectJobWithStream(
    job: PendingJob,
    message: string,
  ): Promise<void> {
    await job.emit({
      type: CHAT_STREAM_EVENT.ERROR,
      code: AGENT_CORE_ERROR_CODES.INTERNAL_ERROR,
      message,
    });
    job.reject(new WorkerJobFailedError(message, true));
  }

  private async runLoop(): Promise<void> {
    while (!this.stopped) {
      await this.waitForWork();
      if (this.stopped) {
        break;
      }

      const job = this.inbox.shift();
      if (!job) {
        continue;
      }

      if (job.signal.aborted) {
        job.reject(new Error("request cancelled before processing"));
        continue;
      }

      this.currentJob = job;
      this.currentJobStartedAt = Date.now();
      try {
        await this.runJob(job);
        job.resolve();
        await this.afterJobSettled();
      } catch (error) {
        job.reject(
          error instanceof Error ? error : new Error(String(error)),
        );
      } finally {
        this.currentJob = undefined;
        this.currentJobStartedAt = undefined;
      }
    }
  }

  private async runJob(job: PendingJob): Promise<void> {
    const abortOnDisconnect = (): void => {
      if (job.signal.aborted) {
        this.agent.abort();
      }
    };
    job.signal.addEventListener("abort", abortOnDisconnect);

    const unsubscribe = this.agent.subscribe(async (event) => {
      if (event.type !== "message_update") {
        return;
      }
      const deltaEvent = event.assistantMessageEvent;
      if (deltaEvent.type !== "text_delta" || deltaEvent.delta.length === 0) {
        return;
      }
      await job.emit({
        type: CHAT_STREAM_EVENT.TOKEN,
        sessionId: job.sessionId,
        token: deltaEvent.delta,
      });
    });

    try {
      await this.agent.prompt(job.prompt);

      if (job.signal.aborted) {
        throw new Error("request cancelled");
      }

      await job.emit({
        type: CHAT_STREAM_EVENT.DONE,
        sessionId: job.sessionId,
        messageId: job.messageId,
      });
    } catch (error) {
      const operatorAbandon = this.operatorAbandonRequested;
      this.operatorAbandonRequested = false;

      const message = operatorAbandon
        ? "abandoned by operator"
        : error instanceof Error
          ? error.message
          : "LLM request failed";

      await job.emit({
        type: CHAT_STREAM_EVENT.ERROR,
        code: AGENT_CORE_ERROR_CODES.INTERNAL_ERROR,
        message,
      });

      if (job.signal.aborted) {
        return;
      }

      throw new WorkerJobFailedError(message, true);
    } finally {
      job.signal.removeEventListener("abort", abortOnDisconnect);
      unsubscribe();
    }
  }

  private async afterJobSettled(): Promise<void> {
    if (!this.memoryManager) {
      return;
    }
    await this.memoryManager.recordTurn();
    if (await this.memoryManager.shouldFlush()) {
      await this.memoryManager.runFlush("turn");
    }
    this.memoryManager.resetFlushCycle();
  }
}
