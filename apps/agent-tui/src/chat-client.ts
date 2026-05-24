import {
  AGENT_CORE_PATHS,
  CHAT_STREAM_ACCEPT,
  CHAT_STREAM_EVENT,
  type ChatPromptRequest,
  type ChatStreamEvent,
} from "@digital-worker/agent-core-protocol";

export type StreamChatOptions = {
  agentBaseUrl: string;
  clientId: string;
  prompt: string;
  sessionId?: string;
  onEvent: (event: ChatStreamEvent) => void;
  fetchFn?: typeof fetch;
};

export class ChatClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatClientError";
  }
}

export async function streamChat(options: StreamChatOptions): Promise<void> {
  const fetchFn = options.fetchFn ?? fetch;
  const url = new URL(AGENT_CORE_PATHS.chat, options.agentBaseUrl);
  const body: ChatPromptRequest = {
    clientId: options.clientId,
    prompt: options.prompt,
    sessionId: options.sessionId,
  };

  const response = await fetchFn(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: CHAT_STREAM_ACCEPT,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new ChatClientError(
      `chat request failed: ${response.status} ${response.statusText}`,
    );
  }

  if (!response.body) {
    throw new ChatClientError("chat response has no body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSseBuffer(buffer);
    buffer = rest;

    for (const event of events) {
      options.onEvent(event);
      if (
        event.type === CHAT_STREAM_EVENT.DONE ||
        event.type === CHAT_STREAM_EVENT.ERROR
      ) {
        return;
      }
    }
  }
}

export function parseSseBuffer(buffer: string): {
  events: ChatStreamEvent[];
  rest: string;
} {
  const events: ChatStreamEvent[] = [];
  const blocks = buffer.split("\n\n");
  const rest = blocks.pop() ?? "";

  for (const block of blocks) {
    const dataLine = block
      .split("\n")
      .find((line) => line.startsWith("data: "));
    if (!dataLine) {
      continue;
    }

    const json = dataLine.slice(6).trim();
    if (!json) {
      continue;
    }

    events.push(JSON.parse(json) as ChatStreamEvent);
  }

  return { events, rest };
}
