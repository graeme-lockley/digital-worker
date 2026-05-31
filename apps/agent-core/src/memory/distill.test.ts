import { describe, expect, it } from "vitest";

import { heuristicDedup } from "./distill.js";

describe("heuristicDedup", () => {
  it("removes exact duplicate bullets", () => {
    const chunks = [
      { id: "1", text: "Operator prefers pnpm." },
      { id: "2", text: "operator prefers pnpm." },
      { id: "3", text: "Different fact." },
    ];
    const result = heuristicDedup(chunks);
    expect(result).toHaveLength(2);
  });
});
