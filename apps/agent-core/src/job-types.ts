import type { ChatStreamEvent } from "@digital-worker/agent-core-protocol";

/** Optional streaming sink for chat jobs; notify jobs omit this. */
export type OutputSink = {
  emit?: (event: ChatStreamEvent) => Promise<void>;
};

export type JobBase = {
  id: string;
  messageId: string;
  clientId: string;
  prompt: string;
  sessionId: string;
  enqueueAt: number;
  signal: AbortSignal;
};

export type ChatJob = JobBase & {
  kind: "chat";
  emit: (event: ChatStreamEvent) => Promise<void>;
};

export type NotifyJob = JobBase & {
  kind: "notify";
};

export type InboxJob = ChatJob | NotifyJob;

export function isChatJob(job: InboxJob): job is ChatJob {
  return job.kind === "chat";
}
