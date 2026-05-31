import { describe, expect, it, vi } from "vitest";

import { RESTART_EXIT_CODE } from "./exit-codes.js";
import { spawnReplacementProcess, usesRestartLoop } from "./process-restart.js";

describe("usesRestartLoop", () => {
  it("is true when AGENT_CORE_RESTART_LOOP is set", () => {
    const previous = process.env.AGENT_CORE_RESTART_LOOP;
    process.env.AGENT_CORE_RESTART_LOOP = "1";
    try {
      expect(usesRestartLoop()).toBe(true);
    } finally {
      if (previous === undefined) {
        delete process.env.AGENT_CORE_RESTART_LOOP;
      } else {
        process.env.AGENT_CORE_RESTART_LOOP = previous;
      }
    }
  });
});

describe("RESTART_EXIT_CODE", () => {
  it("matches the docker restart loop script", () => {
    expect(RESTART_EXIT_CODE).toBe(75);
  });
});

describe("spawnReplacementProcess", () => {
  it("spawns a detached process with the given argv", () => {
    const spawn = vi.fn().mockReturnValue({ unref: vi.fn() });

    spawnReplacementProcess(
      ["/usr/bin/node", "dist/index.js", "--port", "3000"],
      { FOO: "bar" },
      "/app",
      spawn,
    );

    expect(spawn).toHaveBeenCalledWith(
      "/usr/bin/node",
      ["dist/index.js", "--port", "3000"],
      {
        detached: true,
        stdio: "inherit",
        env: { FOO: "bar" },
        cwd: "/app",
      },
    );
  });
});
