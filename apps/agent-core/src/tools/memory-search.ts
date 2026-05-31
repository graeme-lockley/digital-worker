import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";

import type { MemoryManager } from "../memory/memory-manager.js";

export type MemorySearchDeps = {
  memoryManager: MemoryManager;
};

export function createMemorySearchTool(
  deps: MemorySearchDeps,
): AgentTool<typeof memorySearchParameters> {
  return {
    name: "memory_search",
    label: "Memory Search",
    description:
      "Search Aida's memory archive (daily logs, roll-ups, MEMORY.md) via full-text index. Use when recalling something from a past session or topic.",
    parameters: memorySearchParameters,
    execute: async (_toolCallId, params) => {
      const hits = deps.memoryManager.index.search(
        params.query,
        params.limit ?? 10,
      );
      if (hits.length === 0) {
        return {
          content: [{ type: "text", text: "No memory matches found." }],
          details: { hits: [] },
        };
      }
      const formatted = hits
        .map(
          (h, i) =>
            `${i + 1}. [${h.date || "unknown"}] ${h.section} (${h.filePath})\n   ${h.content.slice(0, 300)}`,
        )
        .join("\n\n");
      return {
        content: [
          {
            type: "text",
            text: `Found ${hits.length} memory match(es):\n\n${formatted}`,
          },
        ],
        details: { hits },
      };
    },
  };
}

const memorySearchParameters = Type.Object({
  query: Type.String({
    description: "Search query for memory recall",
    minLength: 1,
    maxLength: 500,
  }),
  limit: Type.Optional(
    Type.Number({
      description: "Maximum results (default 10)",
      minimum: 1,
      maximum: 25,
    }),
  ),
});
