import type { ChatStreamEvent } from "@digital-worker/agent-core-protocol";

/** Optional streaming sink for chat jobs; notify jobs may attach deliver for auto-reply. */
export type OutputSink = {
  emit?: (event: ChatStreamEvent) => Promise<void>;
};

export type DeliverReply = (
  text: string,
  messageIds?: string[],
) => Promise<void>;

export type JobBase = {
  id: string;
  messageId: string;
  clientId: string;
  prompt: string;
  sessionId: string;
  enqueueAt: number;
  signal: AbortSignal;
  /** Optional per-job model override (provider/model or bare id). */
  model?: string;
};

export type ChatJob = JobBase & {
  kind: "chat";
  emit: (event: ChatStreamEvent) => Promise<void>;
};

export type NotifyJob = JobBase & {
  kind: "notify";
  correlationId?: string;
  channel?: string;
  threadId?: string;
  sender?: string;
  messageIds?: string[];
  deliver?: DeliverReply;
};

export type MessageJob = JobBase & {
  kind: "message";
  fromAgentId: string;
  messageType: string;
};

export type InboxJob = ChatJob | NotifyJob | MessageJob;

export function isChatJob(job: InboxJob): job is ChatJob {
  return job.kind === "chat";
}

export function isNotifyJob(job: InboxJob): job is NotifyJob {
  return job.kind === "notify";
}

export function isMessageJob(job: InboxJob): job is MessageJob {
  return job.kind === "message";
}
