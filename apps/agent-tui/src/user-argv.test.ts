import { describe, expect, it } from "vitest";

import { userArgv } from "./user-argv.js";

describe("userArgv", () => {
  it("strips a leading -- separator", () => {
    expect(
      userArgv(["node", "index.tsx", "--", "-r", "http://127.0.0.1:3001"]),
    ).toEqual(["-r", "http://127.0.0.1:3001"]);
  });

  it("passes through normal args", () => {
    expect(userArgv(["node", "index.tsx", "-r", "http://x"])).toEqual([
      "-r",
      "http://x",
    ]);
  });
});
