import { describe, expect, it } from "vitest";

import { GATEWAY_PATHS } from "./index.js";

describe("GATEWAY_PATHS", () => {
  it("defines stable gateway API paths", () => {
    expect(GATEWAY_PATHS.health).toBe("/health");
    expect(GATEWAY_PATHS.messages).toBe("/api/v1/messages");
    expect(GATEWAY_PATHS.outbound).toBe("/api/v1/outbound");
    expect(GATEWAY_PATHS.ack).toBe("/api/v1/ack");
  });
});
