import {
  GATEWAY_PATHS,
  type ReplyRequest,
} from "@digital-worker/agent-gateway-protocol";

import type { DeliverReply } from "./job-types.js";

export function createGatewayReplyForCorrelation(
  gatewayUrl: string,
  correlationId: string,
  fetchFn: typeof fetch = fetch,
): DeliverReply {
  return async (text: string, messageIds?: string[]) => {
    const url = new URL(GATEWAY_PATHS.reply, gatewayUrl);
    const body: ReplyRequest = {
      correlationId,
      text,
      messageIds,
    };

    const response = await fetchFn(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let detail = `${response.status}`;
      try {
        const payload = (await response.json()) as {
          error?: { message?: string };
        };
        if (payload.error?.message) {
          detail = payload.error.message;
        }
      } catch {
        // ignore
      }
      throw new Error(`gateway reply failed: ${detail}`);
    }
  };
}
