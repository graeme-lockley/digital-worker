import { describe, expect, it, vi } from "vitest";

import {
  AGENT_COMMAND,
  AGENT_CORE_PATHS,
  type MaintainMemoryResult,
} from "@digital-worker/agent-core-protocol";

import {
  createTestHarness,
  disposeTestHarness,
  TEST_SESSION_ID,
} from "./test-helpers.js";

describe("POST /api/v1/command", () => {
  it("returns runtime status", async () => {
    const harness = await createTestHarness();
    try {
      const response = await harness.app.request(AGENT_CORE_PATHS.command, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          command: AGENT_COMMAND.STATUS,
          clientId: "operator-1",
        }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        sessionId: TEST_SESSION_ID,
        queueDepth: 0,
        queuedCount: 0,
        active: null,
      });
    } finally {
      await disposeTestHarness(harness);
    }
  });

  it("returns abandon counts", async () => {
    const harness = await createTestHarness();
    try {
      const response = await harness.app.request(AGENT_CORE_PATHS.command, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          command: AGENT_COMMAND.ABANDON,
          clientId: "operator-1",
        }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        abandonedActive: false,
        drainedQueued: 0,
      });
    } finally {
      await disposeTestHarness(harness);
    }
  });

  it("rejects unknown commands", async () => {
    const harness = await createTestHarness();
    try {
      const response = await harness.app.request(AGENT_CORE_PATHS.command, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          command: "pause",
          clientId: "operator-1",
        }),
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "UNKNOWN_COMMAND" },
      });
    } finally {
      await disposeTestHarness(harness);
    }
  });

  it("rejects session mismatch", async () => {
    const harness = await createTestHarness();
    try {
      const response = await harness.app.request(AGENT_CORE_PATHS.command, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          command: AGENT_COMMAND.STATUS,
          clientId: "operator-1",
          sessionId: "wrong-session",
        }),
      });

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "SESSION_MISMATCH" },
      });
    } finally {
      await disposeTestHarness(harness);
    }
  });

  it("accepts shutdown and schedules onShutdown", async () => {
    const harness = await createTestHarness();
    const onShutdown = vi.fn().mockResolvedValue(undefined);
    harness.ctx.onShutdown = onShutdown;

    try {
      const response = await harness.app.request(AGENT_CORE_PATHS.command, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          command: AGENT_COMMAND.SHUTDOWN,
          clientId: "operator-1",
        }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        accepted: true,
        action: "shutdown",
      });
      await vi.waitFor(() => {
        expect(onShutdown).toHaveBeenCalledWith("command");
      });
    } finally {
      await disposeTestHarness(harness);
    }
  });

  it("accepts restart and schedules onRestart", async () => {
    const harness = await createTestHarness();
    const onRestart = vi.fn().mockResolvedValue(undefined);
    harness.ctx.onRestart = onRestart;

    try {
      const response = await harness.app.request(AGENT_CORE_PATHS.command, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          command: AGENT_COMMAND.RESTART,
          clientId: "operator-1",
        }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        accepted: true,
        action: "restart",
      });
      await vi.waitFor(() => {
        expect(onRestart).toHaveBeenCalledWith("command");
      });
    } finally {
      await disposeTestHarness(harness);
    }
  });

  it("runs maintain_memory reindex when memory is enabled", async () => {
    const harness = await createTestHarness();
    try {
      const response = await harness.app.request(AGENT_CORE_PATHS.command, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          command: AGENT_COMMAND.MAINTAIN_MEMORY,
          clientId: "cron",
          scope: "reindex",
        }),
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as MaintainMemoryResult;
      expect(body).toMatchObject({
        scope: "reindex",
        deduped: 0,
        promoted: 0,
      });
      expect(typeof body.durationMs).toBe("number");
    } finally {
      await disposeTestHarness(harness);
    }
  });
});
