import { describe, expect, it } from "vitest";

import { markdownToTelegramHtml } from "./format-markdown.js";

describe("markdownToTelegramHtml", () => {
  it("converts bold and italic", () => {
    const html = markdownToTelegramHtml("Hello **world** and *you*");
    expect(html).toContain("<b>world</b>");
    expect(html).toContain("<i>you</i>");
  });

  it("converts inline code and fenced blocks", () => {
    const html = markdownToTelegramHtml("Use `curl` here:\n\n```\necho hi\n```");
    expect(html).toContain("<code>curl</code>");
    expect(html).toContain("<pre>");
  });

  it("converts headings to bold lines", () => {
    const html = markdownToTelegramHtml("## Section\n\nBody");
    expect(html).toContain("<b>Section</b>");
  });

  it("escapes nothing that breaks telegram when markdown is simple", () => {
    const html = markdownToTelegramHtml("Plain text only.");
    expect(html).toContain("Plain text only.");
  });

  it("converts markdown tables to ascii preformatted text", () => {
    const html = markdownToTelegramHtml(
      "| Product | Qty | Price |\n| --- | --- | --- |\n| Apples | 15 | $3.50 |\n| Blueberries | 120 | $8.00 |",
    );
    expect(html).not.toContain("<table");
    expect(html).toContain("<pre>");
    expect(html).toContain("Product");
    expect(html).toContain("| Qty |");
    expect(html).toContain("+");
    expect(html).toContain("Apples");
    expect(html).toContain("$8.00");
  });

  it("escapes angle brackets inside table cells for pre blocks", () => {
    const html = markdownToTelegramHtml("| Key | Value |\n| --- | --- |\n| x | 1 < 2 |");
    expect(html).toContain("1 &lt; 2");
  });
});
