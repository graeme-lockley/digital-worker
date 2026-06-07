import {
  AGENT_CORE_PATHS,
  CHAT_STREAM_ACCEPT,
  CHAT_STREAM_EVENT,
  type ChatPromptRequest,
  type ChatStreamEvent,
} from "@digital-worker/agent-core-protocol";

export type FireChatOptions = {
  agentBaseUrl: string;
  clientId: string;
  prompt: string;
  model: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  onToken?: (chunk: string) => void;
};

export type FireChatResult = {
  transcript: string;
  messageId?: string;
  error?: string;
};

export class ChatFireError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatFireError";
  }
}

export async function fireChat(options: FireChatOptions): Promise<FireChatResult> {
  const fetchFn = options.fetchFn ?? fetch;
  const url = new URL(AGENT_CORE_PATHS.chat, options.agentBaseUrl);
  const body: ChatPromptRequest = {
    clientId: options.clientId,
    prompt: options.prompt,
    model: options.model,
  };

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 30 * 60 * 1000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchFn(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: CHAT_STREAM_ACCEPT,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === "AbortError") {
      throw new ChatFireError("chat fire timed out");
    }
    if (error instanceof TypeError) {
      throw new ChatFireError("agent unreachable");
    }
    throw error;
  }

  if (!response.ok) {
    clearTimeout(timeout);
    throw new ChatFireError(
      `chat request failed: ${response.status} ${response.statusText}`,
    );
  }

  if (!response.body) {
    clearTimeout(timeout);
    throw new ChatFireError("chat response has no body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let transcript = "";
  let messageId: string | undefined;
  let error: string | undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = parseSseBuffer(buffer);
      buffer = rest;

      for (const event of events) {
        if (event.type === CHAT_STREAM_EVENT.TOKEN) {
          transcript += event.token;
          options.onToken?.(event.token);
        } else if (event.type === CHAT_STREAM_EVENT.DONE) {
          messageId = event.messageId;
          return { transcript, messageId };
        } else if (event.type === CHAT_STREAM_EVENT.ERROR) {
          error = event.message;
          return { transcript, error };
        }
      }
    }
  } finally {
    clearTimeout(timeout);
  }

  if (error) {
    return { transcript, error };
  }

  return {
    transcript,
    error: "chat stream ended without done event",
  };
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
