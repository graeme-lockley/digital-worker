import { describe, expect, it, vi } from "vitest";

import {
  AGENT_COMMAND,
  AGENT_CORE_PATHS,
} from "@digital-worker/agent-core-protocol";

import {
  formatCommandResponse,
  formatDuration,
  parseSlashCommand,
  sendCommand,
} from "./command-client.js";

describe("parseSlashCommand", () => {
  it("maps slash input to command names", () => {
    expect(parseSlashCommand("/status")).toBe("status");
    expect(parseSlashCommand("/abandon")).toBe("abandon");
    expect(parseSlashCommand("/shutdown")).toBe("shutdown");
    expect(parseSlashCommand("/restart")).toBe("restart");
    expect(parseSlashCommand("hello")).toBeUndefined();
    expect(parseSlashCommand("/unknown")).toBeUndefined();
  });
});

describe("formatCommandResponse", () => {
  it("formats status results for human-readable display", () => {
    const text = formatCommandResponse({
      sessionId: "s1-0000-0000-0000-000000000000",
      queueDepth: 2,
      queuedCount: 1,
      active: {
        jobId: "job-1",
        clientId: "client-1",
        runningForMs: 90_000,
      },
      uptimeMs: 3_700_000,
    });

    expect(text).toContain("**Status**");
    expect(text).toContain("**Session:** `s1`");
    expect(text).toContain("**Worker:** Processing (1m 30s)");
    expect(text).toContain("**Queue:** 1 request waiting behind current job");
    expect(text).toContain("**Uptime:** 1h 1m");
  });

  it("formats idle status with an empty queue", () => {
    const text = formatCommandResponse({
      sessionId: "abc-def",
      queueDepth: 0,
      queuedCount: 0,
      active: null,
      uptimeMs: 45_000,
    });

    expect(text).toContain("**Worker:** Idle");
    expect(text).toContain("**Queue:** Empty");
    expect(text).toContain("**Uptime:** 45s");
  });
});

describe("formatDuration", () => {
  it("formats sub-minute, minute, and hour durations", () => {
    expect(formatDuration(500)).toBe("500ms");
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(251_115)).toBe("4m 11s");
    expect(formatDuration(3_700_000)).toBe("1h 1m");
  });
});

describe("sendCommand", () => {
  it("posts to the command endpoint", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        abandonedActive: false,
        drainedQueued: 0,
      }),
    });

    const response = await sendCommand({
      agentBaseUrl: "http://127.0.0.1:3000",
      clientId: "tui-1",
      command: AGENT_COMMAND.ABANDON,
      fetchFn,
    });

    expect(response).toEqual({ abandonedActive: false, drainedQueued: 0 });
    expect(fetchFn).toHaveBeenCalledWith(
      new URL(AGENT_CORE_PATHS.command, "http://127.0.0.1:3000"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          command: AGENT_COMMAND.ABANDON,
          clientId: "tui-1",
        }),
      }),
    );
  });
});
