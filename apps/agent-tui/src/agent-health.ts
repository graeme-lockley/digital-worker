export class AgentHealthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentHealthError";
  }
}

export type WaitForAgentHealthOptions = {
  timeoutMs?: number;
  intervalMs?: number;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Poll GET /health until the agent responds 200 or timeout. */
export async function waitForAgentHealth(
  agentBaseUrl: string,
  options: WaitForAgentHealthOptions = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const intervalMs = options.intervalMs ?? 500;
  const fetchFn = options.fetchFn ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const url = new URL("/health", agentBaseUrl);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetchFn(url);
      if (response.ok) {
        return;
      }
    } catch {
      // agent still restarting
    }
    await sleep(intervalMs);
  }

  throw new AgentHealthError(
    "agent did not become reachable within the timeout",
  );
}
