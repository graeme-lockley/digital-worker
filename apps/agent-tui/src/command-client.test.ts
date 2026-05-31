import { describe, expect, it, vi } from "vitest";

import {
  AGENT_COMMAND,
  AGENT_CORE_PATHS,
} from "@digital-worker/agent-core-protocol";

import {
  formatCommandResponse,
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
  it("formats status results", () => {
    const text = formatCommandResponse({
      sessionId: "s1",
      queueDepth: 2,
      queuedCount: 1,
      active: {
        jobId: "job-1",
        clientId: "client-1",
        runningForMs: 42,
      },
      uptimeMs: 1000,
    });
    expect(text).toContain("session s1");
    expect(text).toContain("queue depth 2");
    expect(text).toContain("active job job-1");
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
