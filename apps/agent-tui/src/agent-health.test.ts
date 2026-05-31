import { describe, expect, it, vi } from "vitest";

import { AgentHealthError, waitForAgentHealth } from "./agent-health.js";

describe("waitForAgentHealth", () => {
  it("returns when health responds ok", async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce({ ok: true });

    await waitForAgentHealth("http://127.0.0.1:3000", {
      fetchFn,
      sleep: async () => {},
      intervalMs: 0,
    });

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("throws when the agent never becomes healthy", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError("fetch failed"));

    await expect(
      waitForAgentHealth("http://127.0.0.1:3000", {
        fetchFn,
        sleep: async () => {},
        timeoutMs: 0,
        intervalMs: 0,
      }),
    ).rejects.toBeInstanceOf(AgentHealthError);
  });
});
