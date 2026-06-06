import {
  AGENT_CORE_PATHS,
  OBSERVER_STREAM_ACCEPT,
  type ObserverEvent,
} from "@digital-worker/agent-core-protocol";

export type StreamObserverOptions = {
  agentBaseUrl: string;
  onEvent: (event: ObserverEvent) => void;
  signal?: AbortSignal;
  fetchFn?: typeof fetch;
};

export class ObserverClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ObserverClientError";
  }
}

export async function streamObserver(
  options: StreamObserverOptions,
): Promise<void> {
  const fetchFn = options.fetchFn ?? fetch;
  const url = new URL(AGENT_CORE_PATHS.observer, options.agentBaseUrl);

  let response: Response;
  try {
    response = await fetchFn(url, {
      method: "GET",
      headers: {
        accept: OBSERVER_STREAM_ACCEPT,
      },
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new ObserverClientError(
        "agent unreachable (is it still starting after a restart?)",
      );
    }
    if (options.signal?.aborted) {
      return;
    }
    throw error;
  }

  if (!response.ok) {
    throw new ObserverClientError(
      `observer request failed: ${response.status} ${response.statusText}`,
    );
  }

  if (!response.body) {
    throw new ObserverClientError("observer response has no body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    if (options.signal?.aborted) {
      await reader.cancel();
      return;
    }

    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseObserverSseBuffer(buffer);
    buffer = rest;

    for (const event of events) {
      options.onEvent(event);
    }
  }
}

export function parseObserverSseBuffer(buffer: string): {
  events: ObserverEvent[];
  rest: string;
} {
  const events: ObserverEvent[] = [];
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

    events.push(JSON.parse(json) as ObserverEvent);
  }

  return { events, rest };
}
