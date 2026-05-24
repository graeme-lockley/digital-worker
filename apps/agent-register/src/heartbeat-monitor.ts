import {
  AGENT_CORE_PATHS,
  type HeartbeatRequest,
  type HeartbeatResponse,
} from "@digital-worker/agent-core-protocol";

import type { AgentRegistryStore } from "./store.js";

export type HeartbeatMonitorOptions = {
  store: AgentRegistryStore;
  intervalMs: number;
  requestTimeoutMs: number;
  fetchFn?: typeof fetch;
};

export class HeartbeatMonitor {
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: HeartbeatMonitorOptions) {
    this.fetchFn = options.fetchFn ?? fetch;
  }

  start(): void {
    if (this.timer) {
      return;
    }

    void this.pollAll();
    this.timer = setInterval(() => {
      void this.pollAll();
    }, this.options.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async pollAll(): Promise<void> {
    const agents = this.options.store.list();
    await Promise.all(agents.map((agent) => this.pollAgent(agent.agentId)));
  }

  async pollAgent(agentId: string): Promise<void> {
    const agent = this.options.store.get(agentId);
    if (!agent) {
      return;
    }

    const polledAt = new Date().toISOString();
    const requestBody: HeartbeatRequest = { polledAt };
    const url = new URL(AGENT_CORE_PATHS.heartbeat, agent.endpoint.url);

    try {
      const response = await this.fetchFn(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.options.requestTimeoutMs),
      });

      if (!response.ok) {
        this.options.store.markSleeping(agentId);
        return;
      }

      const body = (await response.json()) as HeartbeatResponse;
      if (body.agentId !== agentId || body.status !== "ok") {
        this.options.store.markSleeping(agentId);
        return;
      }

      this.options.store.updateHeartbeat(agentId, body.timestamp);
    } catch {
      this.options.store.markSleeping(agentId);
    }
  }
}
