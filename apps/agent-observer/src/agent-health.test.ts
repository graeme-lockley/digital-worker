import { describe, expect, it, vi } from "vitest";

import { waitForAgentHealth } from "./agent-health.js";

describe("waitForAgentHealth", () => {
  it("returns once /health responds 200", async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("refused"))
      .mockResolvedValueOnce({ ok: true });

    await waitForAgentHealth("http://127.0.0.1:3000", {
      fetchFn,
      sleep: async () => {},
      intervalMs: 0,
    });

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("stops when aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      waitForAgentHealth("http://127.0.0.1:3000", {
        signal: controller.signal,
        sleep: async () => {},
      }),
    ).rejects.toThrow("aborted");
  });
});
