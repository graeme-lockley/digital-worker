import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { GatewayStore } from "./store.js";

describe("GatewayStore", () => {
  it("persists and loads state", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "gw-store-"));
    const store = new GatewayStore(dir);

    await store.save({
      messages: [],
      telegramOffset: 42,
    });

    const loaded = await store.load();
    expect(loaded?.telegramOffset).toBe(42);
  });

  it("serializes concurrent saves without ENOENT races", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "gw-store-"));
    const store = new GatewayStore(dir);

    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        store.save({
          messages: [],
          telegramOffset: i,
        }),
      ),
    );

    const raw = await readFile(path.join(dir, "state.json"), "utf8");
    const parsed = JSON.parse(raw) as { telegramOffset: number };
    expect(typeof parsed.telegramOffset).toBe("number");
  });
});
