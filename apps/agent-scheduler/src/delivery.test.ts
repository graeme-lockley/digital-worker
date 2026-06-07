import { describe, expect, it } from "vitest";

import {
  appendDeliveryPrompt,
  computeDeliveryHint,
  detectDeliveryInTranscript,
  promptMentionsDelivery,
} from "./delivery.js";

describe("delivery helpers", () => {
  it("appends delivery suffix unless internal or already mentioned", () => {
    expect(appendDeliveryPrompt("Check scores", false)).toContain("send_message");
    expect(appendDeliveryPrompt("Check scores", true)).toBe("Check scores");
    expect(
      appendDeliveryPrompt("Send via send_message when done", false),
    ).toBe("Send via send_message when done");
  });

  it("detects delivery mentions in prompts and transcripts", () => {
    expect(promptMentionsDelivery("use send_message")).toBe(true);
    expect(detectDeliveryInTranscript("Message sent via telegram.")).toBe(true);
    expect(detectDeliveryInTranscript("Here are the scores.")).toBe(false);
  });

  it("computes delivery hints", () => {
    expect(
      computeDeliveryHint({
        runStatus: "succeeded",
        internalOnly: true,
        deliverFallback: false,
        transcript: "",
        hasDeliverTo: false,
      }),
    ).toBe("internal");

    expect(
      computeDeliveryHint({
        runStatus: "succeeded",
        internalOnly: false,
        deliverFallback: true,
        transcript: "",
        hasDeliverTo: true,
      }),
    ).toBe("scheduler-fallback");

    expect(
      computeDeliveryHint({
        runStatus: "succeeded",
        internalOnly: false,
        deliverFallback: false,
        transcript: "Sent via telegram.",
        hasDeliverTo: true,
      }),
    ).toBe("agent-likely");
  });
});
