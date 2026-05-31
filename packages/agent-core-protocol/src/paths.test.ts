import { describe, expect, it } from "vitest";

import { AGENT_CORE_PATHS } from "./paths.js";

describe("AGENT_CORE_PATHS", () => {
  it("defines stable agent API paths", () => {
    expect(AGENT_CORE_PATHS.heartbeat).toBe("/api/v1/heartbeat");
    expect(AGENT_CORE_PATHS.chat).toBe("/api/v1/chat");
    expect(AGENT_CORE_PATHS.command).toBe("/api/v1/command");
    expect(AGENT_CORE_PATHS.health).toBe("/health");
  });
});
