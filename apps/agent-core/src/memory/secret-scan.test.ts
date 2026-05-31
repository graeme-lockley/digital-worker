import { describe, expect, it } from "vitest";

import { scanAndRedactSecrets } from "./secret-scan.js";

describe("scanAndRedactSecrets", () => {
  it("passes through clean text unchanged", () => {
    const result = scanAndRedactSecrets("Graeme prefers conventional commits.");
    expect(result.redacted).toBe(false);
    expect(result.text).toBe("Graeme prefers conventional commits.");
    expect(result.matches).toHaveLength(0);
  });

  it("redacts OpenAI-style API keys", () => {
    const result = scanAndRedactSecrets("key is sk-abcdefghijklmnopqrstuvwxyz1234567890");
    expect(result.redacted).toBe(true);
    expect(result.text).toContain("[REDACTED:openai_key]");
    expect(result.matches).toContain("openai_key");
  });

  it("redacts bearer tokens", () => {
    const result = scanAndRedactSecrets("Authorization: Bearer abcdef1234567890");
    expect(result.redacted).toBe(true);
    expect(result.matches).toContain("bearer_token");
  });
});
