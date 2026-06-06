import { describe, expect, it, vi } from "vitest";

import { AGENT_CORE_PATHS } from "@digital-worker/agent-core-protocol";

import { buildAgentMessagePrompt } from "./deliver.js";
import { createApp } from "./server.js";
import { createTestHarness, disposeTestHarness, TEST_AGENT_ID } from "./test-helpers.js";

describe("buildAgentMessagePrompt", () => {
  it("labels the sender and notes fire-and-forget semantics", () => {
    const prompt = buildAgentMessagePrompt(
      "sender-agent-id",
      "please review the report",
    );
    expect(prompt).toContain("[message from agent sender-agent-id]");
    expect(prompt).toContain("please review the report");
    expect(prompt).toContain("no automatic reply");
    expect(prompt).toContain("send_to_agent");
  });
});

describe("POST /api/v1/deliver", () => {
  it("accepts delivery and returns 202 immediately", async () => {
    const harness = await createTestHarness("Inter-agent ack");
    const promptSpy = vi.spyOn(harness.ctx.session.agent, "prompt");

    try {
      const app = createApp(harness.ctx);

      const response = await app.request(AGENT_CORE_PATHS.deliver, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            messageId: "msg-123",
            fromAgentId: "peer-agent",
            toAgentId: TEST_AGENT_ID,
            type: "message",
            payload: { text: "hello from peer" },
            sentAt: "2026-06-06T12:00:00.000Z",
          },
        }),
      });

      expect(response.status).toBe(202);
      const body = (await response.json()) as {
        messageId: string;
        acceptedAt: string;
      };
      expect(body.messageId).toBe("msg-123");
      expect(body.acceptedAt).toBeTruthy();

      await vi.waitFor(() => {
        expect(promptSpy).toHaveBeenCalled();
      });

      const calledPrompt = promptSpy.mock.calls[0]?.[0] as string;
      expect(calledPrompt).toContain("[message from agent peer-agent]");
      expect(calledPrompt).toContain("hello from peer");
    } finally {
      promptSpy.mockRestore();
      await disposeTestHarness(harness);
    }
  });

  it("returns 404 when toAgentId does not match this worker", async () => {
    const harness = await createTestHarness("Ignored");
    try {
      const app = createApp(harness.ctx);

      const response = await app.request(AGENT_CORE_PATHS.deliver, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            messageId: "msg-404",
            fromAgentId: "peer-agent",
            toAgentId: "wrong-agent-id",
            type: "message",
            payload: { text: "hello" },
            sentAt: "2026-06-06T12:00:00.000Z",
          },
        }),
      });

      expect(response.status).toBe(404);
      const body = (await response.json()) as {
        error: { code: string; message: string };
      };
      expect(body.error.code).toBe("NOT_FOUND");
    } finally {
      await disposeTestHarness(harness);
    }
  });

  it("returns 400 when payload.text is missing", async () => {
    const harness = await createTestHarness("Ignored");
    try {
      const app = createApp(harness.ctx);

      const response = await app.request(AGENT_CORE_PATHS.deliver, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            messageId: "msg-400",
            fromAgentId: "peer-agent",
            toAgentId: TEST_AGENT_ID,
            type: "message",
            payload: {},
            sentAt: "2026-06-06T12:00:00.000Z",
          },
        }),
      });

      expect(response.status).toBe(400);
      const body = (await response.json()) as {
        error: { code: string };
      };
      expect(body.error.code).toBe("INVALID_REQUEST");
    } finally {
      await disposeTestHarness(harness);
    }
  });
});
