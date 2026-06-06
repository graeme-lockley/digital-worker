import { Marked } from "marked";

const marked = new Marked({ async: false, gfm: true });

/** Map markdown (e.g. from the LLM) to Telegram-safe HTML subset. */
export function markdownToTelegramHtml(markdown: string): string {
  const html = marked.parse(markdown.trim(), { async: false }) as string;
  return sanitizeForTelegramHtml(html);
}

function sanitizeForTelegramHtml(html: string): string {
  let out = convertHtmlTablesToPre(html)
    .replace(/<\/?p>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<h[1-6]>/gi, "<b>")
    .replace(/<\/h[1-6]>/gi, "</b>\n")
    .replace(/<strong>/gi, "<b>")
    .replace(/<\/strong>/gi, "</b>")
    .replace(/<em>/gi, "<i>")
    .replace(/<\/em>/gi, "</i>")
    .replace(/<del>/gi, "<s>")
    .replace(/<\/del>/gi, "</s>")
    .replace(/<hr\s*\/?>/gi, "\n———\n")
    .replace(/<\/?blockquote>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/?ul>/gi, "\n")
    .replace(/<\/?ol>/gi, "\n")
    .replace(/<img[^>]*>/gi, "")
    .replace(/<span(?![^>]*tg-spoiler)[^>]*>/gi, "")
    .replace(/<\/span>/gi, "")
    .replace(/<\/?div>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Telegram message limit is 4096 chars.
  if (out.length > 4096) {
    out = out.slice(0, 4093) + "…";
  }

  return out;
}

/** Telegram HTML has no table tags; render as a monospace pre block instead. */
function convertHtmlTablesToPre(html: string): string {
  return html.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_match, inner) => {
    const rows = parseHtmlTableRows(inner);
    if (rows.length === 0) {
      return "";
    }

    const text = formatAlignedTable(rows);
    return `\n<pre>${escapeForTelegramPre(text)}</pre>\n`;
  });
}

function parseHtmlTableRows(tableInner: string): string[][] {
  const rows: string[][] = [];
  const rowMatches = tableInner.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);

  for (const rowMatch of rowMatches) {
    const rowInner = rowMatch[1];
    if (rowInner === undefined) {
      continue;
    }

    const cells: string[] = [];
    const cellMatches = rowInner.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi);

    for (const cellMatch of cellMatches) {
      const cellInner = cellMatch[1];
      if (cellInner === undefined) {
        continue;
      }

      cells.push(decodeHtmlEntities(stripHtmlTags(cellInner)).replace(/\s+/g, " ").trim());
    }

    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  return rows;
}

function formatAlignedTable(rows: string[][]): string {
  const colCount = Math.max(...rows.map((row) => row.length));
  const widths = Array.from({ length: colCount }, (_, col) =>
    Math.max(1, ...rows.map((row) => (row[col] ?? "").length)),
  );

  const formatRow = (row: string[]) =>
    Array.from({ length: colCount }, (_, col) => (row[col] ?? "").padEnd(widths[col]!)).join(
      " | ",
    );

  const separator = widths.map((width) => "-".repeat(width)).join("+");

  const lines = [formatRow(rows[0]!)];
  if (rows.length > 1) {
    lines.push(separator);
    for (const row of rows.slice(1)) {
      lines.push(formatRow(row));
    }
  }

  return lines.join("\n");
}

function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]+>/g, "");
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function escapeForTelegramPre(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
