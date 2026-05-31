import { Marked, type MarkedExtension } from "marked";
import { markedTerminal } from "marked-terminal";

const marked = new Marked({ async: false });
marked.use(markedTerminal() as MarkedExtension);

export function renderMarkdownToAnsi(content: string): string {
  if (!content) {
    return "";
  }

  return (marked.parse(content) as string).trimEnd();
}
