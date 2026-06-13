import { describe, expect, it } from "vitest";

import { parseFrontMatter, serializePage } from "./front-matter.js";

describe("front-matter", () => {
  it("parses and serializes wiki front matter", () => {
    const raw = `---
title: Usage
updated_by: Aida
updated_at: 2026-06-09T10:00:00.000Z
revision: 2
---

# Usage

Body text.`;

    const parsed = parseFrontMatter(raw);
    expect(parsed.frontMatter).toEqual({
      title: "Usage",
      updatedBy: "Aida",
      updatedAt: "2026-06-09T10:00:00.000Z",
      revision: 2,
    });
    expect(parsed.body).toContain("Body text.");

    const serialized = serializePage(parsed.frontMatter!, parsed.body);
    const roundTrip = parseFrontMatter(serialized);
    expect(roundTrip.frontMatter?.title).toBe("Usage");
    expect(roundTrip.frontMatter?.revision).toBe(2);
  });
});
