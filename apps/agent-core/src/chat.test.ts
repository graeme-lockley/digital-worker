import { describe, expect, it } from "vitest";

import {
  AGENT_CORE_PATHS,
  CHAT_STREAM_ACCEPT,
  CHAT_STREAM_EVENT,
} from "@digital-worker/agent-core-protocol";

import {
  createTestHarness,
  disposeTestHarness,
  TEST_SESSION_ID,
} from "./test-helpers.js";

async function readSseEvents(response: Response): Promise<unknown[]> {
  const text = await response.text();
  const events: unknown[] = [];
  for (const block of text.split("\n\n")) {
    const line = block
      .split("\n")
      .find((l) => l.startsWith("data: "));
    if (line) {
      events.push(JSON.parse(line.slice(6)));
    }
  }
  return events;
}

describe("POST /api/v1/chat", () => {
  it("streams token events then done", async () => {
    const harness = await createTestHarness("Hi there");
    try {
      const response = await harness.app.request(AGENT_CORE_PATHS.chat, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: CHAT_STREAM_ACCEPT,
        },
        body: JSON.stringify({
          clientId: "tui-1",
          prompt: "hi",
        }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain(
        "text/event-stream",
      );

      const events = await readSseEvents(response);
      const tokens = events.filter(
        (e): e is { type: string; token: string } =>
          typeof e === "object" &&
          e !== null &&
          "type" in e &&
          e.type === CHAT_STREAM_EVENT.TOKEN,
      );
      const done = events.find(
        (e) =>
          typeof e === "object" &&
          e !== null &&
          "type" in e &&
          e.type === CHAT_STREAM_EVENT.DONE,
      );

      expect(tokens.map((t) => t.token).join("")).toBe("Hi there");
      expect(done).toMatchObject({ sessionId: TEST_SESSION_ID });
    } finally {
      await disposeTestHarness(harness);
    }
  });

  it("rejects missing prompt", async () => {
    const harness = await createTestHarness();
    try {
      const response = await harness.app.request(AGENT_CORE_PATHS.chat, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: "tui-1", prompt: "  " }),
      });

      expect(response.status).toBe(400);
    } finally {
      await disposeTestHarness(harness);
    }
  });

  it("rejects session mismatch", async () => {
    const harness = await createTestHarness();
    try {
      const response = await harness.app.request(AGENT_CORE_PATHS.chat, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: "tui-1",
          prompt: "hi",
          sessionId: "wrong-session",
        }),
      });

      expect(response.status).toBe(409);
    } finally {
      await disposeTestHarness(harness);
    }
  });
});
