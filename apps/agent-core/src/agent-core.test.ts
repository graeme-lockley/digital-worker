import { describe, expect, it } from "vitest";

import { parseCli } from "./cli.js";
import { createApp } from "./server.js";

describe("parseCli", () => {
  it("uses default host and port", () => {
    expect(parseCli(["node", "agent-core"])).toEqual({
      host: "127.0.0.1",
      port: 3000,
    });
  });

  it("parses --host and --port", () => {
    expect(
      parseCli(["node", "agent-core", "--host", "0.0.0.0", "--port", "8080"]),
    ).toEqual({
      host: "0.0.0.0",
      port: 8080,
    });
  });
});

describe("createApp", () => {
  it("GET /health returns ok", async () => {
    const app = createApp();
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("GET /api/v1 returns service metadata", async () => {
    const app = createApp();
    const response = await app.request("/api/v1");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      service: "agent-core",
      version: "0.0.0",
    });
  });
});
