/** Appended to scheduled prompts unless internalOnly or prompt already mentions delivery. */
export const DEFAULT_DELIVERY_SUFFIX =
  "\n\n---\nWhen this task completes, deliver the outcome to Graeme on Telegram via send_message (unless the full result was already sent during this turn). Briefly confirm delivery in your reply text.";

export type DeliveryHint =
  | "internal"
  | "agent-likely"
  | "scheduler-fallback"
  | "not-detected"
  | "n/a";

const AGENT_DELIVERY_PATTERNS = [
  /\bsend_message\b/i,
  /\bmessage sent via telegram\b/i,
  /\bsent via telegram\b/i,
  /\bdelivered to telegram\b/i,
  /\bsent (?:it |the (?:message|briefing|update) )?(?:to )?(?:you|graeme) on telegram\b/i,
  /\bi(?:'ve| have) sent\b/i,
];

export function promptMentionsDelivery(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) {
    return false;
  }
  if (/\binternal[- ]only\b/i.test(text)) {
    return true;
  }
  return AGENT_DELIVERY_PATTERNS.some((pattern) => pattern.test(text));
}

export function appendDeliveryPrompt(
  prompt: string,
  internalOnly: boolean,
): string {
  const trimmed = prompt.trim();
  if (internalOnly || promptMentionsDelivery(trimmed)) {
    return trimmed;
  }
  return `${trimmed}${DEFAULT_DELIVERY_SUFFIX}`;
}

/** Heuristic on assistant text tokens only (tool results are not in the transcript). */
export function detectDeliveryInTranscript(transcript: string): boolean {
  const text = transcript.trim();
  if (!text) {
    return false;
  }
  return AGENT_DELIVERY_PATTERNS.some((pattern) => pattern.test(text));
}

export function computeDeliveryHint(params: {
  runStatus: string;
  internalOnly: boolean;
  deliverFallback: boolean;
  transcript: string;
  hasDeliverTo: boolean;
}): DeliveryHint {
  if (params.runStatus === "failed" || params.runStatus === "interrupted") {
    return "n/a";
  }
  if (params.runStatus === "running") {
    return "n/a";
  }
  if (params.internalOnly) {
    return "internal";
  }
  if (params.deliverFallback) {
    return "scheduler-fallback";
  }
  if (detectDeliveryInTranscript(params.transcript)) {
    return "agent-likely";
  }
  if (params.hasDeliverTo) {
    return "not-detected";
  }
  return "not-detected";
}

export function formatDeliveryHint(hint: DeliveryHint): string {
  switch (hint) {
    case "internal":
      return "Internal only (no delivery expected)";
    case "agent-likely":
      return "Telegram delivery likely (agent text mentions send)";
    case "scheduler-fallback":
      return "Telegram delivery via scheduler fallback";
    case "not-detected":
      return "Telegram delivery not detected in transcript";
    case "n/a":
      return "—";
  }
}
