import stripAnsi from "strip-ansi";
import { describe, expect, it } from "vitest";

import { renderMarkdownToAnsi } from "./render-markdown.js";

describe("renderMarkdownToAnsi", () => {
  it("renders bold without markdown markers", () => {
    const output = renderMarkdownToAnsi("**hello**");

    expect(output).not.toContain("**");
    expect(stripAnsi(output)).toBe("hello");
    expect(output).toMatch(/\u001b\[[0-9;]*m/);
  });

  it("renders headings with styling", () => {
    const output = renderMarkdownToAnsi("# Title");

    expect(stripAnsi(output)).toBe("# Title");
    expect(output).toMatch(/\u001b\[[0-9;]*m/);
  });

  it("renders inline code with styling", () => {
    const output = renderMarkdownToAnsi("inline `code` here");

    expect(output).not.toContain("`");
    expect(stripAnsi(output)).toBe("inline code here");
    expect(output).toMatch(/\u001b\[[0-9;]*m/);
  });

  it("passes plain text through unchanged", () => {
    const output = renderMarkdownToAnsi("plain text");

    expect(stripAnsi(output)).toBe("plain text");
  });

  it("returns empty string for empty input", () => {
    expect(renderMarkdownToAnsi("")).toBe("");
  });
});
