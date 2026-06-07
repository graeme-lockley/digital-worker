import type {
  DeliveryHint,
  ScheduledEvent,
  ScheduledRun,
  ScheduledRunSummary,
} from "@digital-worker/agent-scheduler-protocol";

import { computeDeliveryHint } from "./delivery.js";

export function enrichRun<T extends ScheduledRun>(
  run: T,
  event: ScheduledEvent,
): T & { deliveryHint: DeliveryHint } {
  return {
    ...run,
    deliveryHint: computeDeliveryHint({
      runStatus: run.status,
      internalOnly: event.internalOnly === true,
      deliverFallback: run.deliverFallback === true,
      transcript: run.transcript,
      hasDeliverTo: Boolean(event.deliverTo?.channel),
    }),
  };
}

export function enrichRunSummary(
  run: ScheduledRunSummary,
  event?: Pick<
    ScheduledEvent,
    "internalOnly" | "deliverTo"
  >,
): ScheduledRunSummary {
  return {
    ...run,
    deliveryHint: computeDeliveryHint({
      runStatus: run.status,
      internalOnly: event?.internalOnly === true,
      deliverFallback: run.deliverFallback === true,
      transcript: run.transcript,
      hasDeliverTo: Boolean(event?.deliverTo?.channel),
    }),
  };
}
