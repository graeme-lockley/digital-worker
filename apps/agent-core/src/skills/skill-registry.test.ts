import path from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { SkillRegistry } from "./skill-registry.js";

const sampleSkillMd = `---
name: sample-skill
description: Runs sample procedures for unit tests. Use when testing skill loading.
---

# Sample skill

Test body.
`;

describe("SkillRegistry", () => {
  it("refresh lists skills from skills directory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "dw-skills-"));
    const skillDir = path.join(root, "sample-skill");
    try {
      await mkdir(skillDir, { recursive: true });
      await writeFile(path.join(skillDir, "SKILL.md"), sampleSkillMd, "utf8");

      const registry = new SkillRegistry(root);
      const skills = await registry.refresh();

      expect(skills).toHaveLength(1);
      expect(skills[0]?.name).toBe("sample-skill");
      expect(skills[0]?.description).toContain("unit tests");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("formatForPrompt includes name, description, and location", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "dw-skills-"));
    const skillDir = path.join(root, "sample-skill");
    try {
      await mkdir(skillDir, { recursive: true });
      await writeFile(path.join(skillDir, "SKILL.md"), sampleSkillMd, "utf8");

      const registry = new SkillRegistry(root);
      await registry.refresh();
      const section = registry.formatForPrompt();

      expect(section).toContain("sample-skill");
      expect(section).toContain("unit tests");
      expect(section).toContain("SKILL.md");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("formatForPrompt returns empty string when no skills", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "dw-skills-empty-"));
    try {
      const registry = new SkillRegistry(root);
      await registry.refresh();
      expect(registry.formatForPrompt()).toBe("");
      expect(registry.list()).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
