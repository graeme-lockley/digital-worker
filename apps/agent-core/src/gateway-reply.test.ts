import { describe, expect, it, vi } from "vitest";

import { createGatewayReplyForCorrelation } from "./gateway-reply.js";

describe("createGatewayReplyForCorrelation", () => {
  it("posts reply to gateway with correlation and message ids", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    const deliver = createGatewayReplyForCorrelation(
      "http://127.0.0.1:3002",
      "telegram:123",
      fetchMock as unknown as typeof fetch,
    );

    await deliver("Hello back", ["msg-1"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [urlArg, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(urlArg)).toBe("http://127.0.0.1:3002/api/v1/reply");
    expect(JSON.parse(String(init.body))).toEqual({
      correlationId: "telegram:123",
      text: "Hello back",
      messageIds: ["msg-1"],
    });
  });

  it("throws when gateway reply fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ error: { message: "send failed" } }),
    });
    const deliver = createGatewayReplyForCorrelation(
      "http://127.0.0.1:3002",
      "telegram:123",
      fetchMock as unknown as typeof fetch,
    );

    await expect(deliver("Hi")).rejects.toThrow("gateway reply failed");
  });
});
