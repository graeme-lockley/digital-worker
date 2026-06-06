import { describe, expect, it, vi } from "vitest";

import { createApp } from "./server.js";
import { createTestHarness, disposeTestHarness } from "./test-helpers.js";

describe("POST /api/v1/notify", () => {
  it("accepts notification and returns 202 immediately", async () => {
    const harness = await createTestHarness("Doorbell ack");
    const promptSpy = vi.spyOn(harness.ctx.session.agent, "prompt");

    try {
      const app = createApp(harness.ctx);

      const response = await app.request("/api/v1/notify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: "gateway",
          prompt: "You have 1 new Telegram message from graeme.",
        }),
      });

      expect(response.status).toBe(202);
      const body = (await response.json()) as {
        jobId: string;
        acceptedAt: string;
      };
      expect(body.jobId).toBeTruthy();
      expect(body.acceptedAt).toBeTruthy();

      await vi.waitFor(() => {
        expect(promptSpy).toHaveBeenCalledWith(
          "You have 1 new Telegram message from graeme.",
        );
      });
    } finally {
      promptSpy.mockRestore();
      await disposeTestHarness(harness);
    }
  });
});
