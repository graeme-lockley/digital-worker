import type { Agent } from "@earendil-works/pi-agent-core";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";

import type { IdentityStore } from "../workspace/identity-store.js";
import { buildSystemPrompt, type WorkspaceIdentity } from "../workspace/index.js";

export type UpdateIdentityDeps = {
  identityStore: IdentityStore;
  getIdentity: () => WorkspaceIdentity;
  setIdentityContent: (content: string) => void;
  getSkillsSection: () => string;
  agent: Agent;
};

export function createUpdateIdentityTool(
  deps: UpdateIdentityDeps,
): AgentTool<typeof updateIdentityParameters> {
  return {
    name: "update_identity",
    label: "Update Identity",
    description:
      "Persist durable self-knowledge to IDENTITY.md. Use only for lasting facts about yourself, not transient task state.",
    parameters: updateIdentityParameters,
    execute: async (_toolCallId, params) => {
      await deps.identityStore.write(params.content);
      deps.setIdentityContent(params.content);
      const identity = deps.getIdentity();
      deps.agent.state.systemPrompt = buildSystemPrompt(
        identity,
        deps.getSkillsSection(),
      );
      return {
        content: [
          {
            type: "text",
            text: `Updated ${deps.identityStore.fileName}: ${params.reason}`,
          },
        ],
        details: { reason: params.reason },
      };
    },
  };
}

const updateIdentityParameters = Type.Object({
  content: Type.String({
    description: "Full revised IDENTITY.md markdown body",
    minLength: 1,
    maxLength: 32_000,
  }),
  reason: Type.String({
    description: "Why this identity update is durable and worth recording",
    minLength: 1,
    maxLength: 500,
  }),
});
