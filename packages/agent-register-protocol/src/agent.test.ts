import { describe, expect, it } from "vitest";

import { AGENT_STATUS } from "./agent.js";

describe("AGENT_STATUS", () => {
  it("defines AVAILABLE and SLEEPING", () => {
    expect(AGENT_STATUS.AVAILABLE).toBe("AVAILABLE");
    expect(AGENT_STATUS.SLEEPING).toBe("SLEEPING");
  });
});
