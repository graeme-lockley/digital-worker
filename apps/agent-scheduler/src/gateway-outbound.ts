import { GATEWAY_PATHS } from "@digital-worker/agent-gateway-protocol";

export type GatewayOutboundBody = {
  channel: string;
  text: string;
  threadId?: string;
};

export class GatewayOutboundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GatewayOutboundError";
  }
}

export async function postGatewayOutbound(
  gatewayUrl: string,
  body: GatewayOutboundBody,
  fetchFn: typeof fetch = fetch,
): Promise<{ delivered: boolean; providerMessageId?: string }> {
  const url = new URL(GATEWAY_PATHS.outbound, gatewayUrl);
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
    throw new GatewayOutboundError(`gateway outbound failed: ${detail}`);
  }

  return (await response.json()) as {
    delivered: boolean;
    providerMessageId?: string;
  };
}
