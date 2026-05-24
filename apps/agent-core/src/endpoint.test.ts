import { describe, expect, it } from "vitest";

import { buildAgentEndpointUrl, resolveAdvertisedHost } from "./endpoint.js";

describe("resolveAdvertisedHost", () => {
  it("maps all-interfaces bind addresses to localhost", () => {
    expect(resolveAdvertisedHost("0.0.0.0")).toBe("127.0.0.1");
    expect(resolveAdvertisedHost("::")).toBe("127.0.0.1");
  });

  it("keeps explicit hostnames", () => {
    expect(resolveAdvertisedHost("10.0.0.5")).toBe("10.0.0.5");
  });
});

describe("buildAgentEndpointUrl", () => {
  it("builds an http URL", () => {
    expect(buildAgentEndpointUrl("127.0.0.1", 3000)).toBe(
      "http://127.0.0.1:3000",
    );
  });
});
