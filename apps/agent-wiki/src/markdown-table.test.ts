import { describe, expect, it } from "vitest";

import { parseTableCells } from "./markdown-table.js";

describe("parseTableCells", () => {
  it("splits simple table rows", () => {
    expect(parseTableCells("| A | B |")).toEqual(["A", "B"]);
  });

  it("preserves wiki links that contain pipe separators", () => {
    expect(
      parseTableCells(
        "| [agents/riaan|Riaan] | agent-core-riaan | 3010 | `/app/workspace/Riaan` | @RiaanDigitalBot | 8672094762 |",
      ),
    ).toEqual([
      "[agents/riaan|Riaan]",
      "agent-core-riaan",
      "3010",
      "`/app/workspace/Riaan`",
      "@RiaanDigitalBot",
      "8672094762",
    ]);
  });

  it("handles multiple wiki links in one cell", () => {
    expect(
      parseTableCells("| [agents/aida|Aida] · [agents/riaan|Riaan] | cards |"),
    ).toEqual(["[agents/aida|Aida] · [agents/riaan|Riaan]", "cards"]);
  });

  it("supports double-bracket wiki links in cells", () => {
    expect(parseTableCells("| [[Home|Home]] | landing |")).toEqual([
      "[[Home|Home]]",
      "landing",
    ]);
  });
});
