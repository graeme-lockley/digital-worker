import type { Agent } from "@earendil-works/pi-agent-core";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";

import type { SkillRegistry } from "../skills/skill-registry.js";
import { buildSystemPrompt, type WorkspaceIdentity } from "../workspace/index.js";

export type RefreshSkillsDeps = {
  skillRegistry: SkillRegistry;
  getIdentity: () => WorkspaceIdentity;
  getMemorySection: () => Promise<string>;
  agent: Agent;
};

export function createRefreshSkillsTool(
  deps: RefreshSkillsDeps,
): AgentTool<typeof refreshSkillsParameters> {
  return {
    name: "refresh_skills",
    label: "Refresh Skills",
    description:
      "Rescan workspace/skills for Agent Skills (SKILL.md files), update the available-skills list in your system prompt, and return the current skill names. Call after creating, editing, or deleting a skill.",
    parameters: refreshSkillsParameters,
    execute: async (_toolCallId, params) => {
      const skills = await deps.skillRegistry.refresh();
      const skillsSection = deps.skillRegistry.formatForPrompt();
      const memorySection = await deps.getMemorySection();
      deps.agent.state.systemPrompt = buildSystemPrompt(
        deps.getIdentity(),
        skillsSection,
        memorySection,
      );
      const names = skills.map((skill) => skill.name);
      return {
        content: [
          {
            type: "text",
            text: params.reason
              ? `Refreshed ${names.length} skill(s): ${names.join(", ") || "(none)"}. ${params.reason}`
              : `Refreshed ${names.length} skill(s): ${names.join(", ") || "(none)"}`,
          },
        ],
        details: { count: names.length, names },
      };
    },
  };
}

const refreshSkillsParameters = Type.Object({
  reason: Type.Optional(
    Type.String({
      description: "Why the skill list was refreshed (e.g. created or edited a skill)",
      maxLength: 500,
    }),
  ),
});
