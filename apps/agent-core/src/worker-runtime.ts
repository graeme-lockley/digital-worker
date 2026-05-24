import type { Agent } from "@earendil-works/pi-agent-core";
import {
  AGENT_CORE_ERROR_CODES,
  CHAT_STREAM_EVENT,
  type ChatStreamEvent,
} from "@digital-worker/agent-core-protocol";

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

export class WorkerRuntime {
  private readonly inbox: PendingJob[] = [];
  private readonly waiters: Array<() => void> = [];
  private loopPromise?: Promise<void>;
  private stopped = false;
  private currentJob?: PendingJob;

  constructor(
    private readonly agent: Agent,
    readonly sessionId: string,
  ) {}

  start(): void {
    if (this.loopPromise) {
      return;
    }
    this.loopPromise = this.runLoop();
  }

  async stop(): Promise<void> {
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
      try {
        await this.runJob(job);
        job.resolve();
      } catch (error) {
        job.reject(error instanceof Error ? error : new Error(String(error)));
      } finally {
        this.currentJob = undefined;
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
      const message =
        error instanceof Error ? error.message : "LLM request failed";
      await job.emit({
        type: CHAT_STREAM_EVENT.ERROR,
        code: AGENT_CORE_ERROR_CODES.INTERNAL_ERROR,
        message,
      });
      if (!job.signal.aborted) {
        throw error;
      }
    } finally {
      job.signal.removeEventListener("abort", abortOnDisconnect);
      unsubscribe();
    }
  }
}
