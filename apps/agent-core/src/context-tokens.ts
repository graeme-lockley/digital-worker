import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { estimateTokens } from "@earendil-works/pi-agent-core";

/** Sum message content estimates — ignores stale assistant usage metadata. */
export function estimateContextContentTokens(messages: AgentMessage[]): number {
  let total = 0;
  for (const message of messages) {
    total += estimateTokens(message);
  }
  return total;
}
