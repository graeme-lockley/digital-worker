import { describe, expect, it, vi } from "vitest";

import {
  createCheckMessagesTool,
  createSendMessageTool,
} from "./gateway-messages.js";

describe("gateway message tools", () => {
  it("check_messages formats unread messages", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        messages: [
          {
            id: "telegram-1",
            channel: "telegram",
            sender: "graeme",
            text: "Hello",
            receivedAt: "2026-06-06T10:00:00.000Z",
          },
        ],
        unreadCount: 0,
      }),
    });

    const tool = createCheckMessagesTool({
      gatewayUrl: "http://127.0.0.1:3002",
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const result = await tool.execute("call-1", {});
    const text = result.content[0]?.type === "text" ? result.content[0].text : "";
    expect(text).toContain("graeme");
    expect(text).toContain("Hello");
  });

  it("send_message posts to gateway outbound", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ delivered: true, providerMessageId: "99" }),
    });

    const tool = createSendMessageTool({
      gatewayUrl: "http://127.0.0.1:3002",
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const result = await tool.execute("call-1", {
      channel: "telegram",
      text: "Hi there",
    });
    const text = result.content[0]?.type === "text" ? result.content[0].text : "";
    expect(text).toContain("sent");
    expect(fetchMock).toHaveBeenCalled();
  });
});
