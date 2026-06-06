export type NormalizedInbound = {
  id: string;
  channel: string;
  sender: string;
  text: string;
  threadId?: string;
  receivedAt: string;
};

export type ChannelAdapter = {
  readonly channel: string;
  start(onMessage: (message: NormalizedInbound) => void): Promise<void>;
  send(text: string, threadId?: string): Promise<{ providerMessageId?: string }>;
  stop(): Promise<void>;
};
