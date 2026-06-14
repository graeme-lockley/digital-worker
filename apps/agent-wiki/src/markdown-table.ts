/**
 * Split a markdown table row into cells, ignoring `|` inside `[wiki|links]`.
 * Duplicated in public/app.js (browser bundle is a single served file).
 */
export function parseTableCells(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
    return [];
  }

  const inner = trimmed.slice(1, -1);
  const cells: string[] = [];
  let current = "";
  let bracketDepth = 0;

  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (ch === "[") {
      bracketDepth += 1;
      current += ch;
    } else if (ch === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      current += ch;
    } else if (ch === "|" && bracketDepth === 0) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }

  cells.push(current.trim());
  return cells;
}
