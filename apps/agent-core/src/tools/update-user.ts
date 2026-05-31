import type { Agent } from "@earendil-works/pi-agent-core";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";

import type { UserStore } from "../workspace/user-store.js";
import { buildSystemPrompt, type WorkspaceIdentity } from "../workspace/index.js";

export type UpdateUserDeps = {
  userStore: UserStore;
  getIdentity: () => WorkspaceIdentity;
  setUserContent: (content: string) => void;
  agent: Agent;
};

export function createUpdateUserTool(
  deps: UpdateUserDeps,
): AgentTool<typeof updateUserParameters> {
  return {
    name: "update_user",
    label: "Update User",
    description:
      "Persist durable facts about your operator to USER.md. Use for lasting knowledge about the person you work with, not transient task state.",
    parameters: updateUserParameters,
    execute: async (_toolCallId, params) => {
      await deps.userStore.write(params.content);
      deps.setUserContent(params.content);
      const identity = deps.getIdentity();
      deps.agent.state.systemPrompt = buildSystemPrompt(identity);
      return {
        content: [
          {
            type: "text",
            text: `Updated ${deps.userStore.fileName}: ${params.reason}`,
          },
        ],
        details: { reason: params.reason },
      };
    },
  };
}

const updateUserParameters = Type.Object({
  content: Type.String({
    description: "Full revised USER.md markdown body",
    minLength: 1,
    maxLength: 32_000,
  }),
  reason: Type.String({
    description: "Why this user fact is durable and worth recording",
    minLength: 1,
    maxLength: 500,
  }),
});
