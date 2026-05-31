import type { Agent } from "@earendil-works/pi-agent-core";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";

import type { MemoryManager } from "../memory/memory-manager.js";
import { MEMORY_SECTIONS, type MemorySection } from "../memory/paths.js";
import { buildSystemPrompt, type WorkspaceIdentity } from "../workspace/index.js";

export type RememberDeps = {
  memoryManager: MemoryManager;
  getIdentity: () => WorkspaceIdentity;
  getSkillsSection: () => string;
  getMemorySection: () => Promise<string>;
  agent: Agent;
};

export function createRememberTool(
  deps: RememberDeps,
): AgentTool<typeof rememberParameters> {
  return {
    name: "remember",
    label: "Remember",
    description:
      "Append a durable episodic memory entry to today's daily log (memory/daily/YYYY-MM-DD.md). Use for facts, decisions, open threads, and corrections — not for operator profile (update_user) or self-knowledge (update_identity).",
    parameters: rememberParameters,
    execute: async (_toolCallId, params) => {
      const section = params.section as MemorySection;
      const { redacted } = await deps.memoryManager.store.appendDaily(
        section,
        params.content,
      );
      await deps.memoryManager.onMemoryChanged();
      const memorySection = await deps.getMemorySection();
      deps.agent.state.systemPrompt = buildSystemPrompt(
        deps.getIdentity(),
        deps.getSkillsSection(),
        memorySection,
      );
      const redactedNote = redacted ? " (secrets redacted)" : "";
      return {
        content: [
          {
            type: "text",
            text: `Remembered in ${section}: ${params.reason}${redactedNote}`,
          },
        ],
        details: { section, reason: params.reason, redacted },
      };
    },
  };
}

const rememberParameters = Type.Object({
  section: Type.String({
    description: "Memory section: Facts | Decisions | Open threads | Failures / corrections",
    enum: [...MEMORY_SECTIONS],
  }),
  content: Type.String({
    description: "Memory entry text (timestamp added automatically)",
    minLength: 1,
    maxLength: 4000,
  }),
  reason: Type.String({
    description: "Why this is worth remembering across sessions",
    minLength: 1,
    maxLength: 500,
  }),
});
