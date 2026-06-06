import { OBSERVER_EVENT } from "@digital-worker/agent-core-protocol";
import { describe, expect, it } from "vitest";

import { parseObserverSseBuffer } from "./observer-client.js";

describe("parseObserverSseBuffer", () => {
  it("parses complete SSE blocks", () => {
    const buffer = [
      `data: ${JSON.stringify({
        type: OBSERVER_EVENT.HELLO,
        agentId: "a1",
        sessionId: "s1",
      })}`,
      "",
      `data: ${JSON.stringify({
        type: OBSERVER_EVENT.TEXT_DELTA,
        jobId: "j1",
        delta: "hi",
      })}`,
      "",
      "data: {",
    ].join("\n");

    const { events, rest } = parseObserverSseBuffer(buffer);
    expect(events).toHaveLength(2);
    expect(events[0]?.type).toBe(OBSERVER_EVENT.HELLO);
    expect(events[1]?.type).toBe(OBSERVER_EVENT.TEXT_DELTA);
    expect(rest).toBe("data: {");
  });
});
