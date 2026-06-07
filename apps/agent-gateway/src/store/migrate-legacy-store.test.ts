import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { GatewayStore } from "./gateway-store.js";

async function createLegacyDir(state: unknown): Promise<string> {
  const dir = path.join(
    tmpdir(),
    `gw-legacy-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "state.json"), JSON.stringify(state), "utf8");
  return dir;
}

describe("migrateLegacyGatewayState", () => {
  it("imports rows from legacy state.json when the target store is empty", async () => {
    const dbUrl = `file:${path.join(
      tmpdir(),
      `gw-db-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    )}`;
    const legacyDir = await createLegacyDir({
      messages: [
        {
          id: "msg-1",
          channel: "telegram",
          sender: "graeme",
          text: "legacy hello",
          threadId: "8672094762",
          receivedAt: "2026-06-06T10:00:00.000Z",
          read: false,
        },
      ],
      telegramOffset: 99,
      correlations: {
        "telegram:8672094762": {
          channel: "telegram",
          threadId: "8672094762",
          sender: "graeme",
        },
      },
    });

    const store = await GatewayStore.create(dbUrl, { legacyDataDir: legacyDir });
    const bootstrap = await store.loadBootstrap();

    expect(bootstrap.messages).toHaveLength(1);
    expect(bootstrap.messages[0]?.text).toBe("legacy hello");
    expect(bootstrap.telegramOffset).toBe(99);
    expect(bootstrap.correlations["telegram:8672094762"]?.sender).toBe("graeme");

    await store.close();
  });

  it("skips migration when the target already has messages", async () => {
    const dbUrl = `file:${path.join(
      tmpdir(),
      `gw-db-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    )}`;
    const legacyDir = await createLegacyDir({
      messages: [
        {
          id: "msg-1",
          channel: "telegram",
          sender: "graeme",
          text: "legacy",
          receivedAt: "2026-06-06T10:00:00.000Z",
          read: false,
        },
      ],
      telegramOffset: 1,
    });

    const store = await GatewayStore.create(dbUrl);
    await store.upsertMessage({
      id: "existing",
      channel: "telegram",
      sender: "graeme",
      text: "already here",
      receivedAt: "2026-06-06T11:00:00.000Z",
      read: false,
    });
    await store.close();

    const reopened = await GatewayStore.create(dbUrl, { legacyDataDir: legacyDir });
    const bootstrap = await reopened.loadBootstrap();

    expect(bootstrap.messages).toHaveLength(1);
    expect(bootstrap.messages[0]?.id).toBe("existing");

    await reopened.close();
  });
});
