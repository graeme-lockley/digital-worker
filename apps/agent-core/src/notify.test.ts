import { describe, expect, it, vi } from "vitest";

import { buildChannelMessagePrompt } from "./notify.js";
import { createApp } from "./server.js";
import { createTestHarness, disposeTestHarness } from "./test-helpers.js";

describe("buildChannelMessagePrompt", () => {
  it("labels the conversation and includes sender text", () => {
    const prompt = buildChannelMessagePrompt(
      "telegram:123",
      "graeme",
      "what time is it?",
    );
    expect(prompt).toContain("[conversation telegram:123 from graeme]");
    expect(prompt).toContain("graeme: what time is it?");
    expect(prompt).toContain("delivered to this conversation automatically");
  });
});

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

  it("builds labelled prompt and auto-delivers for channel messages", async () => {
    const harness = await createTestHarness("Auto reply text");
    harness.ctx.gatewayUrl = "http://127.0.0.1:3002";

    const deliverMock = vi.fn().mockResolvedValue(undefined);
    const promptSpy = vi.spyOn(harness.ctx.session.agent, "prompt");

    const originalEnqueue = harness.runtime.enqueue.bind(harness.runtime);
    const enqueueSpy = vi
      .spyOn(harness.runtime, "enqueue")
      .mockImplementation(async (job) => {
        if (job.kind === "notify") {
          job.deliver = deliverMock;
        }
        return originalEnqueue(job);
      });

    try {
      const app = createApp(harness.ctx);

      const response = await app.request("/api/v1/notify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: "gateway",
          prompt: "hello from telegram",
          correlationId: "telegram:123",
          channel: "telegram",
          threadId: "123",
          sender: "graeme",
          messageIds: ["msg-1"],
        }),
      });

      expect(response.status).toBe(202);

      await vi.waitFor(() => {
        expect(promptSpy).toHaveBeenCalled();
      });

      const calledPrompt = promptSpy.mock.calls[0]?.[0] as string;
      expect(calledPrompt).toContain("[conversation telegram:123 from graeme]");
      expect(calledPrompt).toContain("graeme: hello from telegram");

      await vi.waitFor(() => {
        expect(deliverMock).toHaveBeenCalledWith(
          "Auto reply text",
          ["msg-1"],
        );
      });
    } finally {
      enqueueSpy.mockRestore();
      promptSpy.mockRestore();
      await disposeTestHarness(harness);
    }
  });
});
