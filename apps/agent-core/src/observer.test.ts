import {
  AGENT_CORE_PATHS,
  OBSERVER_EVENT,
  OBSERVER_STREAM_ACCEPT,
} from "@digital-worker/agent-core-protocol";
import { describe, expect, it } from "vitest";

import {
  createTestHarness,
  disposeTestHarness,
  TEST_AGENT_ID,
  TEST_SESSION_ID,
} from "./test-helpers.js";

function parseSseEvents(body: string): Array<Record<string, unknown>> {
  const events: Array<Record<string, unknown>> = [];
  for (const block of body.split("\n\n")) {
    const dataLine = block
      .split("\n")
      .find((line) => line.startsWith("data: "));
    if (!dataLine) {
      continue;
    }
    events.push(JSON.parse(dataLine.slice(6).trim()) as Record<string, unknown>);
  }
  return events;
}

describe("observer route", () => {
  it("streams hello on connect", async () => {
    const harness = await createTestHarness();
    try {
      const response = await harness.app.request(AGENT_CORE_PATHS.observer, {
        method: "GET",
        headers: { accept: OBSERVER_STREAM_ACCEPT },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");

      const reader = response.body?.getReader();
      expect(reader).toBeTruthy();

      const decoder = new TextDecoder();
      let buffer = "";
      const { value } = await reader!.read();
      buffer += decoder.decode(value, { stream: true });

      const events = parseSseEvents(buffer);
      expect(events[0]).toEqual({
        type: OBSERVER_EVENT.HELLO,
        agentId: TEST_AGENT_ID,
        sessionId: TEST_SESSION_ID,
      });

      await reader!.cancel();
    } finally {
      await disposeTestHarness(harness);
    }
  });
});
