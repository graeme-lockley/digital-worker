import { OBSERVER_EVENT } from "@digital-worker/agent-core-protocol";
import { describe, expect, it, vi } from "vitest";

import { ObserverHub } from "./observer-hub.js";

describe("ObserverHub", () => {
  it("fans out events to all subscribers", async () => {
    const hub = new ObserverHub();
    const first = vi.fn(async () => {});
    const second = vi.fn(async () => {});
    hub.subscribe(first);
    hub.subscribe(second);

    const event = {
      type: OBSERVER_EVENT.TEXT_DELTA,
      jobId: "job-1",
      delta: "hi",
    } as const;

    await hub.publish(event);

    expect(first).toHaveBeenCalledWith(event);
    expect(second).toHaveBeenCalledWith(event);
  });

  it("unsubscribes and drops failing subscribers", async () => {
    const hub = new ObserverHub();
    const healthy = vi.fn(async () => {});
    const failing = vi.fn(async () => {
      throw new Error("broken");
    });
    hub.subscribe(healthy);
    hub.subscribe(failing);

    await hub.publish({
      type: OBSERVER_EVENT.TEXT_DELTA,
      jobId: "job-1",
      delta: "x",
    });

    expect(healthy).toHaveBeenCalledTimes(1);
    expect(failing).toHaveBeenCalledTimes(1);
    expect(hub.subscriberCount).toBe(1);

    const unsubscribe = hub.subscribe(vi.fn(async () => {}));
    unsubscribe();
    expect(hub.subscriberCount).toBe(1);
  });
});
