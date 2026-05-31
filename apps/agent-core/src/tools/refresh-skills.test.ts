import path from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import type { Agent } from "@earendil-works/pi-agent-core";

import { SkillRegistry } from "../skills/skill-registry.js";
import { createRefreshSkillsTool } from "./refresh-skills.js";
import { buildSystemPrompt } from "../workspace/index.js";
import { loadWorkspace } from "../workspace/load.js";
import { repoWorkspacePath } from "../test-helpers.js";

const extraSkillMd = `---
name: extra-skill
description: Extra skill added at runtime for refresh_skills tests.
---

# Extra
`;

describe("createRefreshSkillsTool", () => {
  it("rescans skills and rebuilds the system prompt", async () => {
    const skillsRoot = await mkdtemp(path.join(tmpdir(), "dw-refresh-skills-"));
    try {
      const loaded = await loadWorkspace({
        agentName: "Aida",
        workspaceDir: repoWorkspacePath(),
      });

      const registry = new SkillRegistry(skillsRoot);
      await registry.refresh();

      const agentState = {
        systemPrompt: buildSystemPrompt(loaded.identity, registry.formatForPrompt()),
      };
      const agent = { state: agentState } as Agent;

      const tool = createRefreshSkillsTool({
        skillRegistry: registry,
        getIdentity: () => loaded.identity,
        getMemorySection: async () => "",
        agent,
      });

      expect(agent.state.systemPrompt).not.toContain("extra-skill");

      await mkdir(path.join(skillsRoot, "extra-skill"), { recursive: true });
      await writeFile(path.join(skillsRoot, "extra-skill", "SKILL.md"), extraSkillMd, "utf8");

      const result = await tool.execute("call-1", {});

      expect(agent.state.systemPrompt).toContain("extra-skill");
      expect(agent.state.systemPrompt).toContain("# Mandate (immutable)");
      expect(result.content[0]?.type).toBe("text");
      if (result.content[0]?.type === "text") {
        expect(result.content[0].text).toContain("extra-skill");
      }
      expect(result.details).toMatchObject({
        count: 1,
        names: ["extra-skill"],
      });
    } finally {
      await rm(skillsRoot, { recursive: true, force: true });
    }
  });
});

describe("createLlmAgent skills integration", () => {
  it("loads workspace skills into the system prompt at startup", async () => {
    const loaded = await loadWorkspace({
      agentName: "Aida",
      workspaceDir: repoWorkspacePath(),
    });

    const registry = new SkillRegistry(path.join(repoWorkspacePath(), "skills"));
    await registry.refresh();
    const section = registry.formatForPrompt();

    expect(section).toContain("skill-authoring");
    expect(section).toContain("Agent Skills");
  });
});
